import os
import requests
from bs4 import BeautifulSoup
from telegram import Update, Bot
from telegram.ext import Dispatcher, CommandHandler, MessageHandler, Filters, CallbackContext
import logging
from flask import Flask, request

# Configuration
TOKEN = "7454733028:AAEEGmZe1-wd2Y8DfriKwMe7px9mSP3vS_I"
PORT = int(os.getenv('PORT', 10000))

# Flask app
app = Flask(__name__)

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

# Initialize bot and dispatcher
bot = Bot(token=TOKEN)
dispatcher = Dispatcher(bot=bot, update_queue=None, workers=4, use_context=True)

@app.route('/')
def home():
    return "🎬 Movie Download Link Bot is Running!", 200

@app.route('/webhook', methods=['POST'])
def webhook():
    try:
        update = Update.de_json(request.get_json(force=True), bot)
        dispatcher.process_update(update)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
    return 'ok', 200

def start(update: Update, context: CallbackContext) -> None:
    update.message.reply_text('🎬 Send me a movie page URL to extract download links.')

def extract_links(url: str) -> list:
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        return [
            {
                'title': h6.get_text(strip=True),
                'url': h6.find_next_sibling('a', class_='maxbutton-oxxfile')['href']
            }
            for h6 in soup.find_all('h6')
            if h6.find_next_sibling('a', class_='maxbutton-oxxfile')
        ]
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return None

def handle_message(update: Update, context: CallbackContext) -> None:
    url = update.message.text.strip()
    if not url.startswith(('http://', 'https://')):
        update.message.reply_text("⚠️ Please send a valid URL.")
        return

    links = extract_links(url)
    if not links:
        update.message.reply_text("❌ No links found.")
        return

    for item in links[:5]:  # Limit to 5 links
        update.message.reply_text(f"🔗 {item['url']}")

def error_handler(update: object, context: CallbackContext) -> None:
    logger.error(f"Update {update} caused error {context.error}")

# Register handlers
dispatcher.add_handler(CommandHandler("start", start))
dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))
dispatcher.add_error_handler(error_handler)

# Set the webhook on first request (only once)
@app.before_first_request
def set_webhook():
    webhook_url = "https://spbot-idtu.onrender.com/webhook"
    if bot.set_webhook(url=webhook_url):
        logger.info(f"✅ Webhook set to {webhook_url}")
    else:
        logger.error("❌ Failed to set webhook")
