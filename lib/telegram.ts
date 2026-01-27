/**
 * Send Telegram notification
 * Bot API: 7967006334:AAH8UgtOO1gDu0J8u2uf1UeA_1aqXOBE3eE
 * User ID: 6213503516
 */

const TELEGRAM_BOT_TOKEN = "7967006334:AAH8UgtOO1gDu0J8u2uf1UeA_1aqXOBE3eE"
const TELEGRAM_USER_ID = "6213503516"
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

export interface FeeNotificationData {
  feeAmount: string
  tokenSymbol: string
  txHash: string
  chainId: number
}

/**
 * Send fee notification to Telegram
 */
export async function sendFeeNotification(data: FeeNotificationData): Promise<void> {
  try {
    const explorerUrl = data.chainId === 1 
      ? `https://etherscan.io/tx/${data.txHash}`
      : `https://pepuscan.com/tx/${data.txHash}`
    
    const message = `💰 *Fee Received*\n\n` +
      `Amount: *${data.feeAmount} ${data.tokenSymbol}*\n` +
      `TX Hash: \`${data.txHash}\`\n` +
      `Chain: ${data.chainId === 1 ? 'Ethereum' : 'Pepe Unchained V2'}\n\n` +
      `[View on Explorer](${explorerUrl})`

    const response = await fetch(TELEGRAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_USER_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Telegram] Failed to send notification:', errorData)
      // Don't throw - we don't want fee sending to fail if Telegram is down
    } else {
      console.log('[Telegram] Fee notification sent successfully')
    }
  } catch (error) {
    console.error('[Telegram] Error sending notification:', error)
    // Don't throw - we don't want fee sending to fail if Telegram is down
  }
}

