import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { markOrderPaid } from '@/app/lib/paymentStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = body;

    // Verify signature from Midtrans
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const expectedSignature = crypto
      .createHash('sha512')
      .update(order_id + status_code + gross_amount + serverKey)
      .digest('hex');

    if (signature_key !== expectedSignature) {
      console.error('Invalid Midtrans signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // Process based on transaction status
    if (
      transaction_status === 'capture' ||
      transaction_status === 'settlement'
    ) {
      if (fraud_status === 'accept' || !fraud_status) {
        markOrderPaid(order_id);
        console.log(`Order ${order_id} marked as PAID`);
      }
    } else if (
      transaction_status === 'cancel' ||
      transaction_status === 'deny' ||
      transaction_status === 'expire'
    ) {
      console.log(`Order ${order_id} status: ${transaction_status}`);
    } else if (transaction_status === 'pending') {
      console.log(`Order ${order_id} is PENDING`);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: `Webhook processing failed: ${error.message}` },
      { status: 500 }
    );
  }
}
