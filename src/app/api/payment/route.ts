import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID diperlukan.' }, { status: 400 });
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      return NextResponse.json({ error: 'Midtrans belum dikonfigurasi.' }, { status: 500 });
    }

    // Use Midtrans Snap API directly via fetch (no SDK dependency issues)
    const authString = Buffer.from(serverKey + ':').toString('base64');
    
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
    const baseUrl = isProduction 
      ? 'https://app.midtrans.com' 
      : 'https://app.sandbox.midtrans.com';

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: 15000,
      },
      item_details: [
        {
          id: 'EXPORT_DOCX',
          price: 15000,
          quantity: 1,
          name: 'Export Jurnal (.docx) - Jurnalis.AI',
        },
      ],
    };

    const response = await fetch(`${baseUrl}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`,
      },
      body: JSON.stringify(parameter),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Midtrans API error:', errorData);
      return NextResponse.json(
        { error: 'Gagal membuat transaksi pembayaran.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      token: data.token,
      redirectUrl: data.redirect_url,
    });
  } catch (error: any) {
    console.error('Payment API error:', error);
    return NextResponse.json(
      { error: `Gagal memproses pembayaran: ${error.message}` },
      { status: 500 }
    );
  }
}
