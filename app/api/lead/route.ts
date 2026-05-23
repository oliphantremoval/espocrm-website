import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

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
          phoneNumber: body.phone,
          accountName: body.company,
          description: body.message,
          status: 'New',
          source: 'Website',
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
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