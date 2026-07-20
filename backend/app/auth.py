import os
import logging
from typing import Optional
from fastapi import Request, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import credentials, auth

logger = logging.getLogger("prism.auth")

# Initialize Firebase Admin
try:
    import json
    service_account_json = os.environ.get("SERVICE_ACCOUNT_JSON")
    service_account_path = "/app/service-account.json"
    if not os.path.exists(service_account_path):
        service_account_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "service-account.json")
    
    if service_account_json and service_account_json.strip():
        service_account_info = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully from SERVICE_ACCOUNT_JSON env var.")
    elif os.path.exists(service_account_path):
        with open(service_account_path, "r", encoding="utf-8-sig") as f:
            service_account_info = json.load(f)
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully from service-account.json file.")
    else:
        logger.warning("Firebase service account not found in env var or file. Token verification will fail.")
except Exception as e:
    logger.error(f"Error initializing Firebase Admin SDK: {e}", exc_info=True)

security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None)
) -> dict:
    id_token = None
    if credentials:
        id_token = credentials.credentials
    elif token:
        id_token = token

    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials or token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
