import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // CREATE LEAD IN ESPOCRM
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
          phoneNumber: body.phone,
          accountName: body.company,
          description: body.message,
          status: 'New',
        }),
      }
    );

    const crmData = await crmResponse.text();

    console.log('ESPCRM RESPONSE:', crmData);

    // STOP if CRM failed
    if (!crmResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          crmError: crmData,
        },
        {
          status: 500,
        }
      );
    }

    // EMAIL ONLY AFTER SUCCESSFUL LEAD CREATION
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `New Quote Request - ${body.firstName} ${body.lastName}`,
      text: `
New quote request received.

Name: ${body.firstName} ${body.lastName}

Email: ${body.email}

Phone: ${body.phone}

Company/Address: ${body.company}

Message:
${body.message}
      `,
    });

    return NextResponse.json({
      success: true,
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