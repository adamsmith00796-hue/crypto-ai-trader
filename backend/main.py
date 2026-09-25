import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.bot import service as bot

from app.market import get_market_overview, get_trending
from app.news import get_holdings_news, get_news
from app.portfolio import get_portfolio
from app.sentiment import get_sentiment

@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(bot.refresh_loop())
    yield
    task.cancel()


app = FastAPI(title="Crypto Info Hub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/market")
async def market():
    return await get_market_overview()


@app.get("/api/market/trending")
async def trending():
    return await get_trending()


@app.get("/api/news/holdings")
async def news_holdings():
    return await get_holdings_news()


@app.get("/api/portfolio")
async def portfolio():
    return await get_portfolio()


@app.get("/api/news")
async def news():
    return await get_news()


@app.get("/api/sentiment")
async def sentiment():
    return await get_sentiment()


@app.get("/api/bot")
async def bot_status():
    return bot.status()


@app.get("/api/bot/tax.csv")
async def bot_tax_csv():
    return Response(bot.tax_csv(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="six-dot-bot-trades.csv"'})


@app.get("/api/health")
async def health():
    return {"status": "ok"}
