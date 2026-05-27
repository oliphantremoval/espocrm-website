import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // =========================
    // CREATE LEAD IN ESPOCRM
    // =========================

    try {
      const crmResponse = await fetch(
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
            description: `
Phone: ${body.phone}

Message:
${body.message}
            `,
            status: 'New Lead',
          }),
        }
      );

      if (!crmResponse.ok) {
        const errorText = await crmResponse.text();

        console.error('CRM ERROR:', errorText);
      }
    } catch (crmError) {
      console.error('CRM CONNECTION ERROR:', crmError);
    }

    // =========================
    // EMAIL SETUP
    // =========================

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // =========================
    // SEND ADMIN EMAIL
    // =========================

    try {
      await transporter.sendMail({
        from: process.env.SMTP_EMAIL,
        to: process.env.NOTIFICATION_EMAIL,
        subject: 'New Quote Request - Oliphant Removal',
        html: `
          <div style="font-family: Arial; padding: 20px;">
            <h2>New Quote Request</h2>

            <p>
              <strong>Name:</strong>
              ${body.firstName} ${body.lastName}
            </p>

            <p>
              <strong>Email:</strong>
              ${body.email}
            </p>

            <p>
              <strong>Phone:</strong>
              ${body.phone}
            </p>

            <p>
              <strong>Address/Company:</strong>
              ${body.company}
            </p>

            <p>
              <strong>Message:</strong>
            </p>

            <p>
              ${body.message}
            </p>
          </div>
        `,
      });
    } catch (adminEmailError) {
      console.error('ADMIN EMAIL ERROR:', adminEmailError);
    }

    // =========================
    // SEND CUSTOMER CONFIRMATION
    // =========================

    try {
      await transporter.sendMail({
        from: process.env.SMTP_EMAIL,
        to: body.email,
        subject: 'We Received Your Quote Request',
        html: `
          <div style="font-family: Arial; padding: 20px;">
            <h2>Thank You for Contacting Oliphant Removal</h2>

            <p>Hello ${body.firstName},</p>

            <p>
              We received your quote request successfully.
            </p>

            <p>
              Our team will review your request and contact you shortly.
            </p>

            <hr />

            <p>
              <strong>Oliphant Removal</strong><br />
              Professional Tree Removal & Cleanup Services
            </p>
          </div>
        `,
      });
    } catch (customerEmailError) {
      console.error(
        'CUSTOMER EMAIL ERROR:',
        customerEmailError
      );
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('SERVER ERROR:', error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}