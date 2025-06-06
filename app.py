import os
import requests
from bs4 import BeautifulSoup
from telegram import Update
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext
import logging
from flask import Flask, request

# Configuration
TOKEN = os.getenv('TOKEN', 'YOUR_TELEGRAM_BOT_TOKEN')
PORT = int(os.getenv('PORT', 10000))

# Flask app
app = Flask(__name__)

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

@app.route('/')
def home():
    return "Movie Download Link Bot is running!", 200

@app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), updater.bot)
    dispatcher.process_update(update)
    return 'ok', 200

def start(update: Update, context: CallbackContext) -> None:
    update.message.reply_text('🎬 Send me a movie page URL to extract download links')

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
        update.message.reply_text("⚠️ Please send a valid URL")
        return
    
    links = extract_links(url)
    if not links:
        update.message.reply_text("❌ No links found")
        return
    
    for item in links[:5]:  # Limit to 5 links
        update.message.reply_text(f"🔗 {item['url']}")

def error_handler(update: Update, context: CallbackContext) -> None:
    logger.error(f"Update {update} caused error {context.error}")

# Initialize bot
updater = Updater(TOKEN)
dispatcher = updater.dispatcher

# Register handlers
dispatcher.add_handler(CommandHandler("start", start))
dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))
dispatcher.add_error_handler(error_handler)

if __name__ == '__main__':
    # For production with webhook
    updater.start_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path=TOKEN,
        webhook_url=f"https://yourdomain.com/{TOKEN}"
    )
    updater.idle()
