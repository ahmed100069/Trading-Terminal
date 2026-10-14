from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models as _models  # noqa: F401
from app.api.router import api_router
from app.core.config import settings
from app.core.database import create_database


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    create_database()
    yield


app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    description="A multi-asset Trading Terminal API for live market data, strategy analysis, AI outlooks, risk monitoring, and paper trading.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)

