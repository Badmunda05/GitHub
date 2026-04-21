"""
bot_web_patch.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add this command handler to your existing bot.py
to allow users to set their web dashboard secret.

INSTRUCTIONS:
1. Copy the handler below into bot.py
2. Place it after the other @app.on_message handlers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── Paste this block into bot.py ──────────────────────────────

PATCH_CODE = '''
@app.on_message(filters.command("websecret") & filters.private)
async def cmd_set_web_secret(client: Client, msg: Message):
    """
    /websecret mypassword123
    Sets a secret key for web dashboard login.
    Each user has their own secret — stored securely in DB.
    """
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2 or len(parts[1].strip()) < 6:
        await msg.reply(
            "🔐 **Set Web Dashboard Secret**\\n\\n"
            "Usage: `/websecret yourpassword`\\n\\n"
            "• Minimum 6 characters\\n"
            "• Only you know this key\\n"
            "• Used to login at the web dashboard\\n\\n"
            "Example: `/websecret MySuperSecret123`"
        )
        return
    
    secret = parts[1].strip()
    uid = msg.from_user.id
    await db._set(uid, "web_secret", secret)
    await db._set(uid, "username", msg.from_user.username or str(uid))
    
    await msg.reply(
        f"✅ **Web Secret Set!**\\n\\n"
        f"You can now login at the web dashboard with:\\n"
        f"• Telegram ID: `{uid}`\\n"
        f"• Your secret key\\n\\n"
        "🔒 Keep this secret safe — never share it."
    )
'''

if __name__ == "__main__":
    print("Add the following to your bot.py:\n")
    print(PATCH_CODE)
