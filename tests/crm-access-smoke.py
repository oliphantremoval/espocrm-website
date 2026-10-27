import os
import socket
from pathlib import Path
import json
import secrets
import subprocess
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from playwright.sync_api import sync_playwright, expect

ROOT = str(Path(__file__).resolve().parents[1])
ports = []
while len(ports) < 2:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
        if port not in ports:
            ports.append(port)
BLOCKED_PORT, AUTH_PORT = ports
PASSWORD = 'local-test-only-owner-password-' + secrets.token_hex(10)
SECRET = secrets.token_hex(32)
BASE = f'http://localhost:{AUTH_PORT}'
BLOCKED = f'http://localhost:{BLOCKED_PORT}'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect())

def request(path, method='GET', password=None, origin=None, cookie=None, base=BASE, ip='127.0.0.10', headers=None, body=None):
    hdrs = {'x-forwarded-for': ip, **(headers or {})}
    if origin is not None: hdrs['Origin'] = origin
    if cookie is not None: hdrs['Cookie'] = cookie
    if password is not None:
        body = urlencode({'password': password}).encode()
        hdrs['Content-Type'] = 'application/x-www-form-urlencoded'
    elif method == 'POST' and body is None:
        body = b''
    try:
        response = opener.open(Request(base + path, data=body, headers=hdrs, method=method), timeout=15)
    except HTTPError as error:
        response = error
    return response.code, response.headers, response.read().decode()

rsc_headers = {'RSC': '1', 'Next-Router-State-Tree': quote(json.dumps(['', {}, None, 'refetch'], separators=(',', ':'))), 'Next-Url': '/'}
module_code = 'require("./.next/server/app/crm/page_client-reference-manifest.js");const m=globalThis.__RSC_MANIFEST["/crm/page"].clientModules;process.stdout.write(JSON.stringify([...new Set(Object.entries(m).filter(([k])=>k.includes("/crm/dashboard.tsx")).map(([,v])=>v.id))]));'
module_ids = json.loads(subprocess.check_output(['node','-e',module_code], cwd=ROOT))
assert module_ids
module_refs = [':I[' + json.dumps(value) + ',' for value in module_ids]

processes = []
logs = []
try:
    for port, configured in [(BLOCKED_PORT, False), (AUTH_PORT, True)]:
        config = dict(os.environ)
        config.pop('CRM_OWNER_PASSWORD', None)
        config.pop('CRM_SESSION_SECRET', None)
        config['NEXT_TELEMETRY_DISABLED'] = '1'
        if configured:
            config['CRM_OWNER_PASSWORD'] = PASSWORD
            config['CRM_SESSION_SECRET'] = SECRET
        log = open(f'/tmp/oliphant-auth-server-{port}.log', 'w')
        logs.append(log)
        process = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', str(port)], cwd=ROOT, env=config, stdout=log, stderr=subprocess.STDOUT)
        processes.append(process)
        for _ in range(60):
            if process.poll() is not None: raise AssertionError('Local auth test server failed to start; inspect its log.')
            try:
                code, _, _ = request('/', base=f'http://localhost:{port}')
                if code == 200: break
            except URLError: pass
            if process.poll() is not None: raise AssertionError('Local auth test server failed to start; inspect its log.')
            time.sleep(.2)
        else: raise AssertionError('Local auth test server did not become ready.')

    for path in ['/crm', '/crm/login', '/crm?_rsc=blocked']:
        code, _, body = request(path, base=BLOCKED)
        assert code == 404, (path, code)
        assert 'Opening your workspace' not in body
    assert request('/crm/auth/login', method='POST', base=BLOCKED, password=PASSWORD, origin=BLOCKED)[0] == 404
    code, _, body = request('/', base=BLOCKED)
    assert code == 200 and 'Team workspace' not in body and 'href="/crm"' not in body
    code, _, body = request('/crm?_rsc=missing-config', base=BLOCKED, headers=rsc_headers)
    assert code in (200, 404) and 'NEXT_HTTP_ERROR_FALLBACK;404' in body
    assert not any(ref in body for ref in module_refs)
    print('PASS: missing config denies page/login/direct POST/RSC; public homepage has no workspace link', flush=True)

    code, hdrs, body = request('/crm')
    assert code == 307 and hdrs['Location'].endswith('/crm/login')
    assert 'no-store' in hdrs.get('Cache-Control', '')
    assert 'Opening your workspace' not in body
    code, hdrs, body = request('/crm', headers={'RSC': '1'})
    assert code in (200, 307) and 'Opening your workspace' not in body and 'dashboard' not in body.lower()
    code, _, body = request('/crm', headers={'RSC': '1', 'Next-Router-Prefetch': '1'})
    assert code in (200, 307) and 'Opening your workspace' not in body and 'dashboard' not in body.lower()
    code, hdrs, body = request('/crm?_rsc=forced-refetch', headers=rsc_headers)
    assert code == 200 and 'NEXT_REDIRECT;replace;/crm/login;307;' in body
    assert 'no-store' in hdrs.get('Cache-Control', '') and not any(ref in body for ref in module_refs)
    assert request('/crm/auth/login')[0] == 405
    assert request('/crm/auth/logout')[0] == 405
    assert request('/crm/auth/login', method='POST', password=PASSWORD, origin='https://untrusted.example')[0] == 403
    assert request('/crm/auth/login', method='POST', password=PASSWORD)[0] == 403
    code, hdrs, _ = request('/crm/auth/login', method='POST', password='wrong-owner-password-long-enough', origin=BASE)
    assert code == 303 and 'error=invalid' in hdrs['Location'] and 'Set-Cookie' not in hdrs
    code, hdrs, _ = request('/crm/auth/login', method='POST', password=PASSWORD, origin=BASE)
    assert code == 303 and hdrs['Location'].endswith('/crm')
    set_cookie = hdrs['Set-Cookie']
    for required in ['__Host-oliphant-crm-session=', 'HttpOnly', 'Secure', 'SameSite=strict', 'Path=/', 'Max-Age=7200']:
        assert required.lower() in set_cookie.lower(), required
    assert PASSWORD not in set_cookie and SECRET not in set_cookie
    cookie = set_cookie.split(';')[0]
    code, hdrs, body = request('/crm', cookie=cookie)
    assert code == 200 and 'no-store' in hdrs.get('Cache-Control', '')
    assert PASSWORD not in body and SECRET not in body
    code, _, body = request('/crm?_rsc=authenticated-refetch', cookie=cookie, headers=rsc_headers)
    assert code == 200 and 'NEXT_REDIRECT' not in body and any(ref in body for ref in module_refs)
    assert request('/crm', cookie=cookie + '; ' + cookie)[0] == 307
    forged = cookie[:-1] + ('A' if cookie[-1] != 'A' else 'B')
    assert request('/crm', cookie=forged)[0] == 307
    assert request('/crm/auth/logout', method='POST', cookie=cookie, origin='https://untrusted.example')[0] == 403
    code, hdrs, _ = request('/crm/auth/logout', method='POST', cookie=cookie, origin=BASE)
    assert code == 303 and 'Max-Age=0' in hdrs['Set-Cookie']
    print('PASS: server redirects, RSC/prefetch denial, same-origin/POST-only checks, wrong password, signed secure cookie, no-store, duplicate/forged cookie rejection, logout', flush=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, extra_http_headers={'x-forwarded-for': '127.0.0.20'})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/crm')
        expect(page.get_by_label('Password', exact=True)).to_be_visible()
        page.get_by_label('Password', exact=True).fill('another-wrong-password-long-enough')
        page.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.locator('#owner-login-error')).to_contain_text('not recognized')
        page.get_by_label('Password', exact=True).fill(PASSWORD)
        page.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.get_by_role('heading', name='A clear view of the work ahead.')).to_be_visible()
        assert '__Host-oliphant-crm-session' not in page.evaluate('document.cookie')
        page.get_by_role('button', name='New job', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        page.get_by_role('button', name='Close dialog', exact=True).click()
        page.get_by_role('button', name='Sign out', exact=True).click()
        expect(page.get_by_label('Password', exact=True)).to_be_visible()
        assert not any(c['name'] == '__Host-oliphant-crm-session' for c in context.cookies())
        page.go_back()
        expect(page.get_by_label('Password', exact=True)).to_be_visible()
        assert page.get_by_role('heading', name='A clear view of the work ahead.').count() == 0
        page.goto(BASE + '/crm')
        expect(page.get_by_label('Password', exact=True)).to_be_visible()
        assert not errors, errors
        mobile = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
        mobile.goto(BASE + '/crm/login')
        expect(mobile.get_by_label('Password', exact=True)).to_be_visible()
        assert mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        mobile.screenshot(path='/tmp/oliphant-owner-login-mobile.png', full_page=True)
        browser.close()
    print('PASS: actual browser wrong/correct login, protected dashboard interaction, HttpOnly visibility, logout/back/re-entry denial, mobile layout, no JS errors', flush=True)

    for _ in range(5):
        assert request('/crm/auth/login', method='POST', password='wrong-owner-password-long-enough', origin=BASE, ip='127.0.0.30')[0] == 303
    code, hdrs, _ = request('/crm/auth/login', method='POST', password=PASSWORD, origin=BASE, ip='127.0.0.30')
    assert code == 429 and hdrs['Retry-After'] == '900'
    print('PASS: local per-process sign-in attempt limit; no production credentials created or logged', flush=True)
finally:
    for process in processes: process.terminate()
    for process in processes:
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    for log in logs: log.close()
