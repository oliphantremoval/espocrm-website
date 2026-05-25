import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log('FORM DATA:', body);

    console.log('CRM URL:', process.env.ESPOCRM_URL);

    const response = await fetch(
      `${process.env.ESPOCRM_URL}/Lead`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.ESPOCRM_API_KEY || '',
        },
        body: JSON.stringify({
          firstName: body.firstName,
          lastName: body.lastName,
          emailAddress: body.email,
          accountName: body.company,
          description: body.message,
          status: 'New',
        }),
      }
    );

    const text = await response.text();

    console.log('ESPCRM RESPONSE:', text);

    return NextResponse.json({
      success: true,
      response: text,
    });
  } catch (error: any) {
    console.error('FULL ERROR:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}