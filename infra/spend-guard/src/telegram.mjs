// Sends a Telegram message with the Halonic News bot. Never logs the token or
// the request URL (the token is part of it).
export async function notify(env, text) {
  if (!env.TELEGRAM_NEWS_TOKEN || !env.TELEGRAM_NEWS_CHAT_ID) {
    console.error("telegram: secrets missing");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_NEWS_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_NEWS_CHAT_ID, text }),
    });
    if (!res.ok) console.error(`telegram: HTTP ${res.status}`);
    return res.ok;
  } catch {
    console.error("telegram: request failed");
    return false;
  }
}
