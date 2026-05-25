import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // SEND TO ESPOCRM
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
          description: body.message,
          status: 'New',
        }),
      }
    );

    if (!crmResponse.ok) {
      const errorText = await crmResponse.text();

      console.error(errorText);

      throw new Error('Failed to create lead');
    }

    // EMAIL NOTIFICATION
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: process.env.NOTIFICATION_EMAIL,
      subject: 'New Quote Request - Oliphant Removal',
      html: `
        <h2>New Quote Request</h2>

        <p><strong>Name:</strong> ${body.firstName} ${body.lastName}</p>

        <p><strong>Email:</strong> ${body.email}</p>

        <p><strong>Phone:</strong> ${body.phone}</p>

        <p><strong>Company/Address:</strong> ${body.company}</p>

        <p><strong>Message:</strong></p>

        <p>${body.message}</p>
      `,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

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