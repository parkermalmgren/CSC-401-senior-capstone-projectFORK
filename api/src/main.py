import os
import logging
import base64
import json
import re
import time
import httpx
import uuid
from datetime import date, datetime, timedelta
from uuid import UUID
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Header, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
from supabase import create_client, Client
from fastapi import UploadFile, File


# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(env_path)
except ImportError:
    pass  # dotenv not installed, will use system environment variables

# Get Supabase configuration from environment
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
USDA_API_KEY = os.getenv("USDA_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SPOONACULAR_API_KEY = os.getenv("SPOONACULAR_API_KEY")

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is required")
if not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")


# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Initialize the Openai client w/ key
from openai import OpenAI
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# In-memory store for scan sessions (in production, use Redis or database)
scan_sessions: Dict[str, Dict] = {}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Request/Response models for API
class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class ItemCreate(BaseModel):
    name: str
    quantity: int = 1
    expiration_date: Optional[date] = None
    storage_type: Optional[str] = "pantry"  # "pantry", "fridge", "freezer"
    is_opened: Optional[bool] = False  # Whether the item has been opened

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    expiration_date: Optional[date] = None
    storage_type: Optional[str] = None
    is_opened: Optional[bool] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

class ProfileResponse(BaseModel):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: str
    updated_at: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class ExpirationSuggestionRequest(BaseModel):
    name: str
    storage_type: Optional[str] = None  # "pantry", "fridge", "freezer"
    purchased_date: Optional[date] = None
    is_opened: Optional[bool] = False  # Whether the item has been opened
    usda_fdc_id: Optional[int] = None  # USDA FoodData Central ID for better categorization
    usda_food_category: Optional[str] = None  # USDA food category if available

class ExpirationSuggestionResponse(BaseModel):
    suggested_date: Optional[str]  # ISO date string
    days_from_now: Optional[int]
    confidence: str  # "high", "medium", "low"
    category: Optional[str] = None
    recommended_storage_type: Optional[str] = None  # "pantry", "fridge", "freezer"

class JoinHouseholdRequest(BaseModel):
    household_id: str

class ItemResponse(BaseModel):
    id: str
    user_id: str
    name: str
    quantity: int
    expiration_date: Optional[str] = None
    storage_type: Optional[str] = None  # "pantry", "fridge", "freezer"
    is_opened: Optional[bool] = False  # Whether the item has been opened
    added_at: str
    created_at: str
    updated_at: str

class PaginatedItemsResponse(BaseModel):
    items: List[ItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

app = FastAPI(
    title="Smart Pantry API",
    description="Backend API for Smart Pantry application using Supabase",
    version="1.0.0"
)

# CORS configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]

# For development, also allow common localhost ports and local network IPs
if os.getenv("NODE_ENV", "development") == "development":
    common_ports = ["3000", "3001", "3002", "5173", "5174"]  # Common dev server ports
    for port in common_ports:
        origins_to_add = [
            f"http://localhost:{port}",
            f"http://127.0.0.1:{port}",
        ]
        for origin in origins_to_add:
            if origin not in allowed_origins:
                allowed_origins.append(origin)
    
    # Allow all local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) for mobile access
    # This is a regex pattern that will match any local IP
    import re
    local_ip_pattern = re.compile(r'^http://(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)')
    
    # We'll use a custom CORS handler that checks for local IPs
    # For now, allow all origins in development (you can restrict this in production)
    logger.info("Development mode: Allowing all local network origins for mobile access")

# In development, allow local network IPs using regex pattern
if os.getenv("NODE_ENV", "development") == "development":
    # Regex pattern to match local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost)
    local_network_regex = r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)(:\d+)?"
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=local_network_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("Development mode: Allowing local network IPs via regex pattern")
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests and responses"""
    start_time = time.time()
    
    # Log request
    client_ip = request.client.host if request.client else "unknown"
    method = request.method
    url = str(request.url)
    path = request.url.path
    
    # Skip logging for health checks to reduce noise
    if path != "/health":
        logger.info(f"REQUEST: {method} {path} | IP: {client_ip}")
        
        # Log query parameters if present
        if request.url.query:
            logger.debug(f"Query params: {request.url.query}")
    
    # Process request
    try:
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Log response
        status_code = response.status_code
        if path != "/health":
            logger.info(
                f"RESPONSE: {method} {path} | Status: {status_code} | Time: {process_time:.3f}s"
            )
            
            # Log errors
            if status_code >= 400:
                logger.warning(f"ERROR: {method} {path} returned {status_code}")
        
        # Add process time header
        response.headers["X-Process-Time"] = str(process_time)
        return response
    
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(
            f"EXCEPTION: {method} {path} | Error: {str(e)} | Time: {process_time:.3f}s",
            exc_info=True
        )
        raise

# Dependency to get user_id from Authorization header (temporary - will use Firebase later)
def get_user_id(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Temporary function to extract user_id from header.
    TODO: Replace with Firebase Auth token verification
    """
    if not authorization:
        return None
    # For now, expect format: "Bearer user_id"
    try:
        parts = authorization.split()
        if len(parts) == 2 and parts[0] == "Bearer":
            return parts[1]
    except:
        pass
    return None

@app.on_event("startup")
def startup():
    """Initialize application on startup"""
    logger.info("Starting Smart Pantry API...")
    logger.info(f"Supabase URL: {SUPABASE_URL[:30]}...")  # Log partial URL for security
    logger.info(f"CORS allowed origins: {allowed_origins}")
    logger.info(f"API listening on: http://0.0.0.0:8000")
    
    try:
        logger.info("Testing Supabase connection...")
        # Simple test query
        result = supabase.table("profiles").select("id").limit(1).execute()
        logger.info("✓ Supabase connection successful")
    except Exception as e:
        logger.error(f"✗ Supabase connection failed: {e}")
    
    logger.info("API startup complete. Ready to handle requests.")

@app.get("/test")
def test_endpoint():
    logger.info("TEST ENDPOINT CALLED")
    return {"message": "Server is working!"}

# Authentication endpoints
@app.post("/auth/signup")
def signup(req: SignupRequest):
    """Sign up a new user using Supabase Auth"""
    print(f"SIGNUP STARTED for {req.email}")
    logger.info(f"Signup attempt for email: {req.email}")
    try:
        # Create user in Supabase Auth with email confirmation disabled for development
        # Using admin API to create user directly (bypasses email confirmation)
        try:
            print("Trying admin API...")
            # First, try to create user using admin API (auto-confirms email)
            admin_response = supabase.auth.admin.create_user({
                "email": req.email,
                "password": req.password,
                "email_confirm": True,  # Auto-confirm email
                "user_metadata": {
                    "name": req.name
                }
            })
            if not admin_response.user:
                raise HTTPException(status_code=400, detail="Failed to create user")
            
            user_id = str(admin_response.user.id)
            print(f"Admin user created: {user_id}")
            logger.info("Admin user created successfully")

            # Create household for admin user
            print("Creating household...")
            household_result = supabase.table("household").insert({
                "name": f"{req.name}'s Household"
            }).execute()
            print(f"Household created: {household_result.data}")

            household_id = household_result.data[0]["id"]
            print(f"Creating relation for household {household_id}...")
            supabase.table("relation_househould").insert({
                "user_id": user_id,
                "household_id": household_id
            }).execute()
            print("Relation created successfully")

        except Exception as admin_error:
            print(f"Admin API failed: {admin_error}")
            # Fallback to regular sign_up if admin API fails
            auth_response = supabase.auth.sign_up({
                "email": req.email,
                "password": req.password,
                "options": {
                    "data": {
                        "name": req.name
                    }
                }
            })
            
            if not auth_response.user:
                raise HTTPException(status_code=400, detail="Failed to create user")
            
            user_id = str(auth_response.user.id)
            print(f"Fallback user created: {user_id}")
            logger.info("Fallback user created successfully")
            
            # If user was created but not confirmed, try to confirm them
            try:
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {"email_confirm": True}
                )
            except:
                pass  # If we can't auto-confirm, user will need to confirm via email
            
            # Create household for fallback user
            print("Creating household (fallback)...")
            household_result = supabase.table("household").insert({
                "name": f"{req.name}'s Household"
            }).execute()
            print(f"Household created (fallback): {household_result.data}")
            
            household_id = household_result.data[0]["id"]
            print(f"Creating relation for household {household_id} (fallback)...")
            supabase.table("relation_househould").insert({
                "user_id": user_id,
                "household_id": household_id
            }).execute()
            print("Relation created successfully (fallback)")
        
        # Create profile (trigger should handle this, but ensure it exists)
        try:
            supabase.table("profiles").insert({
                "id": user_id,
                "name": req.name,
                "email": req.email
            }).execute()
        except Exception as e:
            logger.warning(f"Profile creation warning (expected): {str(e)}")
        
        # Return token (using user_id as token for now)
        logger.info(f"Signup successful for user: {user_id} ({req.email})")
        return {

            "token": user_id,
            "user": {
                "id": user_id,
                "name": req.name,
                "email": req.email
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Signup failed for email: {req.email} - {error_msg}")
        print(f"FULL ERROR: {repr(e)}")
        print(f"ERROR TYPE: {type(e).__name__}")
        if "already registered" in error_msg.lower() or "user already exists" in error_msg.lower():
            raise HTTPException(status_code=400, detail="User already exists")
        raise HTTPException(status_code=500, detail=f"Signup failed: {error_msg}")

@app.post("/auth/login")
def login(req: LoginRequest):
    """Login user using Supabase Auth"""
    logger.info(f"Login attempt for email: {req.email}")
    try:
        # Authenticate with Supabase
        auth_response = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })

        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = str(auth_response.user.id)

        # Get user profile
        profile_response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        profile = profile_response.data[0] if profile_response.data else None

        # Return token (using user_id as token for now)
        logger.info(f"Login successful for user: {user_id} ({req.email})")
        return {
            "token": user_id,
            "user": {
                "id": user_id,
                "name": profile.get("name") if profile else req.email,
                "email": req.email
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.warning(f"Login failed for email: {req.email} - {error_msg}")
        if "email not confirmed" in error_msg.lower() or "not confirmed" in error_msg.lower():
            raise HTTPException(status_code=401, detail="Email not confirmed. Please check your email and click the confirmation link.")
        if "invalid" in error_msg.lower() or "credentials" in error_msg.lower():
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=500, detail=f"Login failed: {error_msg}")


# Items endpoints
@app.get("/api/items", response_model=PaginatedItemsResponse)
def list_items(
    user_id: Optional[str] = Depends(get_user_id),
    household_id: Optional[str] = Query(None, description="Filter by household ID"),
    page: int = Query(1, ge=1, description="Page number (starts at 1)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of items per page (max 100)"),
    search: Optional[str] = Query(None, description="Search items by name"),
    sort_by: Optional[str] = Query("created_at", description="Sort field: name, expiration_date, created_at, quantity"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    expiring_soon: Optional[bool] = Query(None, description="Filter items expiring within 7 days"),
):
    """Get all items for the authenticated user's household with pagination, filtering, and sorting"""
    if not user_id:
        logger.warning("GET /api/items - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Use provided household_id or get user's first household
        if household_id:
            # Verify user is in this household
            member_check = supabase.table("relation_househould").select("*").eq("user_id", user_id).eq("household_id", household_id).execute()
            if not member_check.data:
                raise HTTPException(status_code=403, detail="Not a member of this household")
            target_household_id = household_id
        else:
            # Get user's first household
            household_response = supabase.table("relation_househould").select("household_id").eq("user_id", user_id).limit(1).execute()
            if not household_response.data:
                logger.warning(f"No household found for user {user_id}")
                return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}
            target_household_id = household_response.data[0]["household_id"]
        
        # Get all user_ids in the household
        members_response = supabase.table("relation_househould").select("user_id").eq("household_id", target_household_id).execute()
        user_ids = [m["user_id"] for m in members_response.data]
        
        # Build query for items from all household members
        query = supabase.table("items").select("*", count="exact").in_("user_id", user_ids)
        
        # Apply search filter (name contains search term)
        if search:
            query = query.ilike("name", f"%{search}%")
            logger.debug(f"Search filter: '{search}' for user: {user_id}")
        
        # Apply expiration filter
        if expiring_soon is True:
            from datetime import timedelta
            today = date.today()
            future_date = today + timedelta(days=7)
            query = query.not_.is_("expiration_date", "null").gte("expiration_date", today.isoformat()).lte("expiration_date", future_date.isoformat())
            logger.debug(f"Expiring soon filter applied for user: {user_id}")
        elif expiring_soon is False:
            # Get items NOT expiring soon (expires after 7 days or no expiration)
            # Note: This filter is complex and may need adjustment based on Supabase client capabilities
            # For now, we'll skip this filter if it causes issues
            logger.debug(f"Not expiring soon filter skipped for user: {user_id} (complex filter)")
        
        # Validate sort_by field
        valid_sort_fields = ["name", "expiration_date", "created_at", "quantity", "added_at"]
        if sort_by not in valid_sort_fields:
            sort_by = "created_at"
        
        # Validate sort_order
        if sort_order not in ["asc", "desc"]:
            sort_order = "desc"
        
        # Apply sorting
        query = query.order(sort_by, desc=(sort_order == "desc"))
        logger.debug(f"Sorting by: {sort_by} ({sort_order}) for user: {user_id}")
        
        # Calculate pagination
        offset = (page - 1) * page_size
        
        # Get total count and items
        response = query.range(offset, offset + page_size - 1).execute()
        
        total = response.count if hasattr(response, 'count') and response.count is not None else len(response.data)
        total_pages = (total + page_size - 1) // page_size  # Ceiling division
        
        logger.info(f"Retrieved {len(response.data)} items (page {page}/{total_pages}, total: {total}) for user: {user_id}")
        
        return {
            "items": response.data,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    except Exception as e:
        logger.error(f"Error fetching items for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/items/{item_id}", response_model=ItemResponse)
def get_item(item_id: str, user_id: Optional[str] = Depends(get_user_id)):
    """Get a single item by ID"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        response = supabase.table("items").select("*").eq("id", item_id).eq("user_id", user_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Item not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/items", response_model=ItemResponse, status_code=201)
def create_item(item_data: ItemCreate, user_id: Optional[str] = Depends(get_user_id)):
    """Create a new pantry item"""
    if not user_id:
        logger.warning("POST /api/items - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Validate expiration date is not in the past
    if item_data.expiration_date and item_data.expiration_date < date.today():
        logger.warning(f"Invalid expiration date for user {user_id}: {item_data.expiration_date}")
        raise HTTPException(
            status_code=400,
            detail="Expiration date cannot be in the past"
        )
    
    try:
        storage_type = item_data.storage_type or "pantry"
        is_opened = item_data.is_opened if item_data.is_opened is not None else False
        logger.info(f"Creating item '{item_data.name}' (qty: {item_data.quantity}, storage: {storage_type}, opened: {is_opened}) for user: {user_id}")
        new_item = {
            "user_id": user_id,
            "name": item_data.name,
            "quantity": item_data.quantity,
            "expiration_date": item_data.expiration_date.isoformat() if item_data.expiration_date else None,
            "storage_type": storage_type,
            "is_opened": is_opened
        }
        
        response = supabase.table("items").insert(new_item).execute()
        item_id = response.data[0].get("id")
        logger.info(f"Item created successfully: {item_id} for user: {user_id}")
        return response.data[0]
    except Exception as e:
        logger.error(f"Error creating item for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/api/items/{item_id}", response_model=ItemResponse)
def update_item(item_id: str, item_data: ItemUpdate, user_id: Optional[str] = Depends(get_user_id)):
    """Update an existing item"""
    if not user_id:
        logger.warning(f"PUT /api/items/{item_id} - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Check if item exists and belongs to user
    try:
        check_response = supabase.table("items").select("id").eq("id", item_id).eq("user_id", user_id).execute()
        if not check_response.data:
            logger.warning(f"Item {item_id} not found for user {user_id}")
            raise HTTPException(status_code=404, detail="Item not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking item {item_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    # Build update data
    update_data = {}
    if item_data.name is not None:
        update_data["name"] = item_data.name
    if item_data.quantity is not None:
        if item_data.quantity < 1:
            logger.warning(f"Invalid quantity {item_data.quantity} for item {item_id}")
            raise HTTPException(status_code=400, detail="Quantity must be at least 1")
        update_data["quantity"] = item_data.quantity
    if item_data.storage_type is not None:
        update_data["storage_type"] = item_data.storage_type
    if item_data.is_opened is not None:
        update_data["is_opened"] = item_data.is_opened
    if item_data.expiration_date is not None:
        if item_data.expiration_date < date.today():
            logger.warning(f"Invalid expiration date {item_data.expiration_date} for item {item_id}")
            raise HTTPException(
                status_code=400,
                detail="Expiration date cannot be in the past"
            )
        update_data["expiration_date"] = item_data.expiration_date.isoformat()
    
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    try:
        logger.info(f"Updating item {item_id} for user {user_id} with data: {update_data}")
        response = supabase.table("items").update(update_data).eq("id", item_id).eq("user_id", user_id).execute()
        logger.info(f"Item {item_id} updated successfully for user {user_id}")
        return response.data[0]
    except Exception as e:
        logger.error(f"Error updating item {item_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: str, user_id: Optional[str] = Depends(get_user_id)):
    """Delete an item"""
    if not user_id:
        logger.warning(f"DELETE /api/items/{item_id} - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Check if item exists and belongs to user
        check_response = supabase.table("items").select("id").eq("id", item_id).eq("user_id", user_id).execute()
        if not check_response.data:
            logger.warning(f"Item {item_id} not found for user {user_id}")
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Delete the item
        logger.info(f"Deleting item {item_id} for user {user_id}")
        supabase.table("items").delete().eq("id", item_id).eq("user_id", user_id).execute()
        logger.info(f"Item {item_id} deleted successfully for user {user_id}")
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting item {item_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/items/expiring/soon", response_model=PaginatedItemsResponse)
def get_expiring_items(
    days: int = Query(7, ge=1, le=365, description="Number of days to look ahead"),
    user_id: Optional[str] = Depends(get_user_id),
    page: int = Query(1, ge=1, description="Page number (starts at 1)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of items per page (max 100)"),
):
    """Get items expiring within the specified number of days with pagination"""
    if not user_id:
        logger.warning("GET /api/items/expiring/soon - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    from datetime import timedelta
    today = date.today()
    future_date = today + timedelta(days=days)
    
    try:
        # Build query
        query = supabase.table("items").select("*", count="exact").eq("user_id", user_id).not_.is_("expiration_date", "null").gte("expiration_date", today.isoformat()).lte("expiration_date", future_date.isoformat()).order("expiration_date")
        
        # Calculate pagination
        offset = (page - 1) * page_size
        
        # Get total count and items
        response = query.range(offset, offset + page_size - 1).execute()
        
        total = response.count if hasattr(response, 'count') and response.count is not None else len(response.data)
        total_pages = (total + page_size - 1) // page_size  # Ceiling division
        
        logger.info(f"Found {len(response.data)} items expiring within {days} days (page {page}/{total_pages}, total: {total}) for user: {user_id}")
        
        return {
            "items": response.data,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    except Exception as e:
        logger.error(f"Error fetching expiring items for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Expiration suggestion rules (in days from purchase/current date)
# Based on common food shelf life guidelines from USDA, FDA, and food safety organizations
EXPIRATION_RULES = {
    # Dairy products (refrigerated)
    "dairy": {
        "keywords": [
            # Milk and cream
            "milk", "whole milk", "2% milk", "1% milk", "skim milk", "nonfat milk", "cream", "heavy cream", "whipping cream", "light cream", "half and half", "buttermilk", "evaporated milk", "condensed milk", "sweetened condensed milk",
            # Yogurt
            "yogurt", "greek yogurt", "plain yogurt", "vanilla yogurt", "yogurt drink", "kefir", "drinkable yogurt",
            # Cheese (general)
            "cheese", "cheddar", "swiss", "gouda", "brie", "feta", "parmesan", "mozzarella", "ricotta", "cottage cheese", "cream cheese", "mascarpone", "sour cream", "butter", "salted butter", "unsalted butter", "european butter",
            # Additional cheeses
            "provolone", "monterey jack", "colby", "pepper jack", "muenster", "havarti", "fontina", "asiago", "pecorino", "romano", "manchego", "gruyere", "emmental", "camembert", "goat cheese", "chevre", "blue cheese", "gorgonzola", "roquefort", "stilton", "cheddar cheese", "swiss cheese",
            # Processed cheese
            "american cheese", "velveeta", "cheese spread", "cheese dip", "string cheese", "cheese sticks",
        ],
        "usda_categories": ["Dairy and Egg Products"],
        "pantry": None,
        "fridge": 7,  # 7 days
        "freezer": 90,  # 3 months
    },
    # Soft cheeses (shorter shelf life)
    "dairy_soft": {
        "keywords": ["cream cheese", "cottage cheese", "ricotta", "mozzarella", "brie", "camembert", "goat cheese", "fresh cheese"],
        "pantry": None,
        "fridge": 5,  # 5 days
        "freezer": 60,  # 2 months
    },
    # Hard cheeses (longer shelf life)
    "dairy_hard": {
        "keywords": ["parmesan", "cheddar", "swiss", "gouda", "asiago", "pecorino", "romano", "aged cheese"],
        "pantry": None,
        "fridge": 30,  # 30 days
        "freezer": 180,  # 6 months
    },
    # Meat & Poultry (refrigerated)
    "meat": {
        "keywords": [
            # Poultry
            "chicken", "turkey", "duck", "goose", "cornish hen", "chicken breast", "chicken thigh", "chicken wing", "chicken leg", "chicken drumstick", "whole chicken", "chicken parts",
            # Beef
            "beef", "steak", "ribeye", "sirloin", "tenderloin", "filet mignon", "strip steak", "t-bone", "porterhouse", "flank steak", "skirt steak", "brisket", "roast beef", "beef roast", "chuck roast", "pot roast", "beef stew meat", "beef tips",
            # Pork
            "pork", "pork chop", "pork tenderloin", "pork loin", "pork shoulder", "pork butt", "pork ribs", "baby back ribs", "spare ribs", "country ribs", "pork belly",
            # Lamb and other
            "lamb", "lamb chop", "lamb leg", "lamb shoulder", "veal", "venison", "bison", "buffalo", "elk", "rabbit",
            # Processed meats
            "sausage", "bacon", "ham", "deli meat", "lunch meat", "cold cuts", "salami", "pepperoni", "prosciutto", "pancetta", "chorizo", "andouille", "bratwurst", "italian sausage", "breakfast sausage", "hot dog", "hotdogs", "frankfurter", "wieners",
            # Ground meats
            "ground beef", "ground turkey", "ground pork", "ground chicken", "ground lamb", "ground meat", "mince", "meatballs",
        ],
        "usda_categories": ["Poultry Products", "Beef Products", "Pork Products", "Lamb, Veal, and Game Products"],
        "pantry": None,
        "fridge": 3,  # 3 days
        "freezer": 180,  # 6 months
    },
    # Ground meat (shorter shelf life)
    "meat_ground": {
        "keywords": ["ground beef", "ground turkey", "ground pork", "ground chicken", "ground lamb", "ground meat", "mince"],
        "pantry": None,
        "fridge": 2,  # 2 days
        "freezer": 90,  # 3 months
    },
    # Seafood
    "seafood": {
        "keywords": [
            # Fish
            "fish", "salmon", "tuna", "cod", "tilapia", "halibut", "mackerel", "sardines", "anchovies", "sea bass", "trout", "catfish", "snapper", "grouper", "swordfish", "mahi mahi", "bass", "perch", "walleye", "pike", "flounder", "sole", "pollock", "haddock", "whiting", "rockfish", "red snapper", "yellowtail", "branzino", "arctic char", "sturgeon",
            # Shellfish
            "shrimp", "crab", "lobster", "oysters", "mussels", "clams", "scallops", "crayfish", "crawfish", "langoustine", "prawns", "king crab", "snow crab", "dungeness crab", "blue crab", "stone crab",
            # Other seafood
            "squid", "calamari", "octopus", "cuttlefish", "sea urchin", "uni", "abalone", "conch", "whelk",
            # Canned seafood
            "canned tuna", "canned salmon", "canned sardines", "canned anchovies", "canned mackerel",
        ],
        "usda_categories": ["Finfish and Shellfish Products"],
        "pantry": None,
        "fridge": 2,  # 2 days
        "freezer": 90,  # 3 months
    },
    # Shellfish (very short shelf life)
    "seafood_shellfish": {
        "keywords": ["shrimp", "crab", "lobster", "oysters", "mussels", "clams", "scallops", "crayfish"],
        "pantry": None,
        "fridge": 1,  # 1 day
        "freezer": 90,  # 3 months
    },
    # Produce - Perishable (leafy greens, berries)
    "produce_perishable": {
        "keywords": [
            # Leafy greens
            "lettuce", "spinach", "kale", "arugula", "chard", "collard greens", "mustard greens", "bok choy", "napa cabbage", "swiss chard", "watercress", "endive", "frisée", "radicchio", "mache", "lambs lettuce",
            # Vegetables
            "broccoli", "carrots", "celery", "bell pepper", "cucumber", "tomato", "mushrooms", "asparagus", "green beans", "zucchini", "squash", "eggplant", "cauliflower", "brussels sprouts", "cabbage", "radishes", "turnips", "beets", "corn on the cob",
            # Peppers (vegetables)
            "bell pepper", "red pepper", "green pepper", "red bell pepper", "green bell pepper", "yellow pepper", "orange pepper", "yellow bell pepper", "orange bell pepper", "sweet pepper", "jalapeño", "jalapeno", "serrano", "habanero", "poblano", "anaheim", "banana pepper", "chili pepper", "chile pepper",
            # Berries and small fruits
            "berries", "grapes", "strawberries", "blueberries", "raspberries", "blackberries", "cherries", "cranberries", "gooseberries", "currants", "elderberries", "mulberries",
            # Other perishable produce
            "artichoke", "artichokes", "fennel", "leeks", "scallions", "green onions", "spring onions", "shallots", "okra", "pattypan squash", "yellow squash", "summer squash", "acorn squash", "butternut squash", "spaghetti squash", "delicata squash",
        ],
        "usda_categories": ["Vegetables and Vegetable Products", "Fruits and Fruit Juices"],
        "pantry": None,
        "fridge": 7,  # 7 days
        "freezer": 30,  # 1 month
    },
    # Leafy greens (very perishable)
    "produce_leafy": {
        "keywords": ["lettuce", "spinach", "kale", "arugula", "chard", "collard greens", "mustard greens", "mesclun", "spring mix", "baby spinach", "romaine", "iceberg"],
        "pantry": None,
        "fridge": 5,  # 5 days
        "freezer": 30,
    },
    # Berries (very perishable)
    "produce_berries": {
        "keywords": ["strawberries", "blueberries", "raspberries", "blackberries", "cranberries", "gooseberries", "currants"],
        "pantry": None,
        "fridge": 5,  # 5 days
        "freezer": 180,  # 6 months
    },
    # Produce - Longer lasting (root vegetables, citrus, apples)
    "produce_long": {
        "keywords": [
            # Root vegetables
            "potato", "onion", "garlic", "sweet potato", "yam", "ginger", "shallot", "leek", "turnip", "rutabaga", "parsnip", "beet", "carrot", "daikon", "radish", "jicama", "celeriac", "celery root",
            # Apples and pears
            "apple", "pear", "granny smith", "gala", "fuji", "honeycrisp", "red delicious", "golden delicious", "bosc pear", "anjou pear", "bartlett pear",
            # Citrus
            "orange", "lemon", "lime", "grapefruit", "tangerine", "clementine", "mandarin", "blood orange", "cara cara", "satsuma", "pomelo", "yuzu", "kumquat",
            # Stone fruits
            "banana", "plum", "peach", "nectarine", "apricot", "cherry", "sweet cherry", "sour cherry",
            # Tropical fruits
            "avocado", "mango", "pineapple", "watermelon", "cantaloupe", "honeydew", "kiwi", "papaya", "guava", "passion fruit", "dragon fruit", "lychee", "rambutan", "starfruit", "carambola", "persimmon", "pomegranate", "coconut", "fresh coconut",
            # Other longer-lasting fruits
            "figs", "dates", "fresh dates", "plantain", "banana plantain",
        ],
        "pantry": 30,  # 30 days
        "fridge": 14,  # 14 days
        "freezer": 90,  # 3 months
    },
    # Root vegetables (very long lasting)
    "produce_root": {
        "keywords": ["potato", "sweet potato", "yam", "onion", "garlic", "shallot", "ginger", "turnip", "rutabaga", "parsnip", "beet", "carrot"],
        "pantry": 60,  # 60 days
        "fridge": 30,  # 30 days
        "freezer": 180,  # 6 months
    },
    # Bread & Bakery
    "bread": {
        "keywords": ["bread", "bagel", "muffin", "roll", "bun", "croissant", "biscuit", "danish", "donut", "doughnut", "pastry", "pita", "tortilla", "naan", "flatbread", "sourdough", "rye bread", "wheat bread", "white bread", "whole grain"],
        "usda_categories": ["Baked Products"],
        "pantry": 5,  # 5 days
        "fridge": 7,  # 7 days
        "freezer": 90,  # 3 months
    },
    # Eggs
    "eggs": {
        "keywords": ["egg", "eggs", "chicken egg", "duck egg", "quail egg"],
        "usda_categories": ["Dairy and Egg Products"],
        "pantry": None,
        "fridge": 21,  # 3 weeks
        "freezer": None,
    },
    # Canned goods
    "canned": {
        "keywords": ["can", "canned", "soup", "beans", "corn", "peas", "tuna can", "salmon can", "sardines can", "tomatoes can", "tomato paste", "tomato sauce", "broth", "stock", "canned fruit", "canned vegetables", "canned meat"],
        "pantry": 365,  # 1 year
        "fridge": 365,  # Same after opening
        "freezer": None,
    },
    # Dry goods (grains, legumes, etc.)
    "dry": {
        "keywords": ["pasta", "rice", "flour", "cereal", "oats", "quinoa", "lentils", "beans dry", "black beans", "kidney beans", "chickpeas", "garbanzo", "barley", "bulgur", "couscous", "buckwheat", "millet", "farro", "wild rice", "brown rice", "white rice", "basmati", "jasmine rice", "breadcrumbs", "cornmeal", "yeast", "active dry yeast", "instant yeast"],
        "usda_categories": ["Cereal Grains and Pasta"],
        "pantry": 730,  # 2 years (grains and legumes)
        "fridge": 730,
        "freezer": 730,
    },
    # Snacks & Packaged
    "packaged": {
        "keywords": ["chips", "crackers", "cookies", "nuts", "pretzels", "popcorn", "trail mix", "granola", "granola bar", "protein bar", "energy bar", "dried fruit", "raisins", "dates", "prunes", "figs", "apricots dried"],
        "pantry": 90,  # 3 months
        "fridge": 90,
        "freezer": 180,  # 6 months
    },
    # Nuts (longer shelf life)
    "nuts": {
        "keywords": ["almonds", "walnuts", "pecans", "cashews", "peanuts", "pistachios", "hazelnuts", "macadamia", "brazil nuts", "pine nuts", "sunflower seeds", "pumpkin seeds", "chia seeds", "flax seeds", "sesame seeds"],
        "pantry": 180,  # 6 months
        "fridge": 365,  # 1 year
        "freezer": 365,  # 1 year
    },
    # Beverages
    "beverages": {
        "keywords": ["juice", "soda", "water", "coffee", "tea", "lemonade", "iced tea", "sports drink", "energy drink", "milk alternative", "almond milk", "soy milk", "oat milk", "coconut milk", "orange juice", "apple juice", "cranberry juice", "grape juice"],
        "pantry": 180,  # 6 months (unopened)
        "fridge": 7,  # 7 days (opened)
        "freezer": None,
    },
    # Condiments & Sauces (shorter shelf life - opened)
    "condiments": {
        "keywords": ["ketchup", "mustard", "relish", "pickles", "olives", "capers", "salsa", "hot sauce", "barbecue sauce", "ranch", "italian dressing", "vinaigrette", "ranch dressing", "caesar dressing", "thousand island", "tartar sauce", "cocktail sauce", "taco sauce", "enchilada sauce"],
        "pantry": 180,  # 6 months (unopened)
        "fridge": 90,  # 3 months (opened, refrigerated)
        "freezer": None,
    },
    # Preserves & Spreads
    "preserves": {
        "keywords": ["jam", "jelly", "preserves", "marmalade", "fruit spread", "peanut butter", "almond butter", "cashew butter", "sunflower butter", "nutella", "chocolate spread"],
        "pantry": 365,  # 1 year (unopened)
        "fridge": 180,  # 6 months (opened)
        "freezer": None,
    },
    # Mayonnaise (shorter shelf life)
    "condiments_mayo": {
        "keywords": ["mayonnaise", "mayo", "aioli"],
        "pantry": None,
        "fridge": 60,  # 2 months
        "freezer": None,
    },
    # Oils (vinegars moved to pantry_staples)
    "oils": {
        "keywords": ["olive oil", "vegetable oil", "canola oil", "coconut oil", "sesame oil", "avocado oil", "grapeseed oil", "sunflower oil", "safflower oil", "peanut oil"],
        "pantry": 730,  # 2 years (unopened), oils can last 1-2 years
        "fridge": 730,
        "freezer": None,
    },
    # Spices & Herbs (dried) - Comprehensive list
    "spices": {
        "keywords": [
            # General terms
            "spice", "herb", "dried herbs", "spice blend", "seasoning", "seasoning blend", "spice mix", "herb mix",
            # Common herbs
            "basil", "oregano", "thyme", "rosemary", "sage", "parsley", "cilantro", "dill", "mint", "chives", "tarragon", "marjoram", "chervil", "sumac",
            # Ground spices
            "paprika", "cumin", "coriander", "turmeric", "cinnamon", "nutmeg", "cloves", "allspice", "cardamom", "star anise", "bay leaves",
            # Pepper varieties (spices)
            "black pepper", "white pepper", "red pepper", "green pepper", "red pepper flakes", "red pepper powder", "green pepper flakes", "cayenne pepper", "cayenne", "crushed red pepper", "pink peppercorns", "green peppercorns", "szechuan pepper", "sichuan pepper", "ground pepper", "peppercorns",
            # Seeds
            "sesame seeds", "poppy seeds", "fennel seeds", "caraway seeds", "celery seeds", "mustard seeds", "cumin seeds", "coriander seeds", "anise seeds", "nigella seeds", "black seeds",
            # Indian spices
            "curry powder", "garam masala", "tandoori masala", "chaat masala", "fenugreek", "asafoetida", "hing", "ajwain", "carom seeds", "kalonji",
            # Middle Eastern spices
            "za'atar", "zaatar", "sumac", "baharat", "ras el hanout", "harissa", "dukkah",
            # Asian spices
            "five spice", "five-spice powder", "szechuan peppercorns", "sichuan peppercorns", "sansho pepper", "sansho", "shichimi togarashi", "togarashi",
            # Latin American spices
            "achiote", "annatto", "adobo", "sazon", "sazonador",
            # Specific ground spices
            "ground ginger", "ground cinnamon", "ground nutmeg", "ground allspice", "ground cloves", "ground cardamom", "ground coriander", "ground cumin", "ground turmeric", "ground paprika",
            # Whole spices
            "whole cloves", "whole cardamom", "whole allspice", "whole nutmeg", "cinnamon sticks", "cinnamon bark", "vanilla beans", "vanilla pods",
            # Chili powders and peppers
            "chili powder", "chile powder", "chipotle powder", "ancho chili powder", "guajillo powder", "smoked paprika", "pimenton", "aleppo pepper", "urfa biber",
            # Specialty blends
            "herbes de provence", "italian seasoning", "poultry seasoning", "pumpkin pie spice", "apple pie spice", "chai spice", "berbere", "ras el hanout",
            # Salt blends (spice blends with salt)
            "seasoned salt", "garlic salt", "onion salt", "celery salt", "lemon pepper", "cajun seasoning", "creole seasoning", "old bay", "old bay seasoning",
            # Other common spices
            "garlic powder", "onion powder", "chili flakes", "red chili flakes", "smoked salt", "hickory smoked salt", "liquid smoke",
            # Additional herbs
            "dried basil", "dried oregano", "dried thyme", "dried rosemary", "dried sage", "dried parsley", "dried dill", "dried mint", "dried tarragon", "dried marjoram",
            # Spice pastes (dried/powdered)
            "curry paste", "harissa paste", "miso paste", "gochujang", "doenjang",
            # Additional seasonings
            "msg", "monosodium glutamate", "citric acid", "cream of tartar",
        ],
        "pantry": 1095,  # 3 years (dried spices/herbs)
        "fridge": 1095,
        "freezer": 1095,
    },
    # Fresh herbs (separate from dried)
    "herbs_fresh": {
        "keywords": ["fresh basil", "fresh oregano", "fresh thyme", "fresh rosemary", "fresh parsley", "fresh cilantro", "fresh dill", "fresh mint", "fresh chives", "fresh sage"],
        "pantry": None,
        "fridge": 7,  # 7 days
        "freezer": 180,  # 6 months
    },
    # Pantry Staples - Long-lasting cooking ingredients (2+ years)
    "pantry_staples": {
        "keywords": [
            # Sugars
            "sugar", "white sugar", "brown sugar", "powdered sugar", "confectioners sugar", "granulated sugar", "cane sugar", "raw sugar", "turbinado sugar", "demerara sugar",
            # Salts
            "salt", "table salt", "sea salt", "kosher salt", "himalayan salt", "rock salt", "iodized salt",
            # Baking ingredients
            "baking powder", "baking soda", "cream of tartar", "vanilla extract", "almond extract", "vanilla bean", "cornstarch", "arrowroot", "gelatin", "pudding mix", "cake mix", "brownie mix",
            # Long-lasting condiments/sauces
            "soy sauce", "fish sauce", "oyster sauce", "hoisin sauce", "teriyaki sauce", "worcestershire sauce", "tabasco", "sriracha", "chili sauce", "vinegar", "balsamic", "rice vinegar", "apple cider vinegar", "white vinegar", "red wine vinegar",
            # Sweeteners
            "honey", "maple syrup", "agave", "molasses", "corn syrup", "golden syrup",
            # Other long-lasting items
            "cocoa powder", "unsweetened cocoa", "chocolate chips", "chocolate bar", "coconut flakes", "shredded coconut", "dried coconut",
        ],
        "pantry": 1095,  # 3 years (many last indefinitely if stored properly)
        "fridge": 1095,  # Same in fridge
        "freezer": 1095,  # Same in freezer
    },
    # Frozen foods
    "frozen": {
        "keywords": ["frozen", "ice cream", "frozen vegetables", "frozen fruit", "frozen meal", "frozen pizza", "frozen burrito", "frozen waffles", "frozen berries"],
        "pantry": None,
        "fridge": None,
        "freezer": 180,  # 6 months
    },
    # Deli & Prepared foods
    "prepared": {
        "keywords": ["deli", "prepared", "ready meal", "meal kit", "salad kit", "hummus", "guacamole", "pesto", "tzatziki", "dip"],
        "pantry": None,
        "fridge": 5,  # 5 days
        "freezer": 30,  # 1 month
    },
    # Tofu & Plant-based
    "plant_based": {
        "keywords": ["tofu", "tempeh", "seitan", "plant based", "vegan", "impossible", "beyond", "meat alternative"],
        "pantry": None,
        "fridge": 7,  # 7 days
        "freezer": 90,  # 3 months
    },
    # Baby food
    "baby_food": {
        "keywords": ["baby food", "infant formula", "baby formula"],
        "pantry": 365,  # 1 year (unopened)
        "fridge": 3,  # 3 days (opened)
        "freezer": None,
    },
    # Kitchen items (non-food)
    "kitchen_cleaning": {
        "keywords": ["dish soap", "sponge", "scrubber", "paper towels", "napkins", "trash bags", "garbage bags", "aluminum foil", "plastic wrap", "wax paper", "parchment paper", "ziploc", "sandwich bag"],
        "pantry": 1095,  # 3 years (indefinite)
        "fridge": None,
        "freezer": None,
    },
    # Note: Salt and basic spices are now in "pantry_staples" and "spices" categories
}

def get_recommended_storage_type(category: Optional[str]) -> Optional[str]:
    """
    Get recommended storage type based on food category.
    Returns: "pantry", "fridge", or "freezer", or None if unknown
    """
    if not category:
        return None
    
    # Categories that should be refrigerated
    fridge_categories = [
        "dairy", "dairy_soft", "dairy_hard",
        "meat", "meat_ground",
        "seafood", "seafood_shellfish",
        "produce_perishable", "produce_leafy", "produce_berries",
        "eggs",
        "prepared",
        "plant_based",
        "condiments_mayo",
        "herbs_fresh",
    ]
    
    # Categories that should be in freezer (if frozen)
    freezer_categories = [
        "frozen",
    ]
    
    # Categories that should be in pantry
    pantry_categories = [
        "produce_long", "produce_root",
        "bread",
        "canned",
        "dry",
        "packaged",
        "nuts",
        "beverages",  # Unopened beverages
        "condiments",  # Unopened condiments
        "preserves",  # Unopened preserves
        "oils",
        "spices",
        "pantry_staples",
        "kitchen_cleaning",
        "baby_food",  # Unopened baby food
    ]
    
    if category in freezer_categories:
        return "freezer"
    elif category in fridge_categories:
        return "fridge"
    elif category in pantry_categories:
        return "pantry"
    
    return None  # Unknown category

def get_storage_safety_level(storage_type: str) -> int:
    """
    Get safety level of storage type (higher = safer for food preservation).
    Returns: 3 (freezer), 2 (fridge), 1 (pantry)
    """
    safety_levels = {
        "freezer": 3,  # Safest - preserves food longest
        "fridge": 2,    # Medium - standard refrigeration
        "pantry": 1     # Least safe - room temperature
    }
    return safety_levels.get(storage_type, 1)

def is_less_safe_storage(chosen: str, recommended: str) -> bool:
    """
    Check if chosen storage is less safe than recommended.
    Returns True if chosen storage has lower safety level than recommended.
    """
    chosen_level = get_storage_safety_level(chosen)
    recommended_level = get_storage_safety_level(recommended)
    return chosen_level < recommended_level

def suggest_expiration_date(
    item_name: str, 
    storage_type: str = "pantry", 
    purchased_date: Optional[date] = None,
    usda_food_category: Optional[str] = None,
    is_opened: bool = False
) -> tuple[Optional[date], str, Optional[str]]:
    """
    Suggest expiration date based on item name, storage type, opened status, and optional USDA category.
    Returns: (suggested_date, confidence, category, recommended_storage_type)
    
    Confidence levels:
    - "high": Exact keyword match or USDA category match
    - "medium": Partial keyword match or related category
    - "low": No match, using default estimate
    
    Note: Opened items typically have shorter shelf life. The function applies reduction factors
    based on category and storage type.
    """
    import re
    
    item_name_lower = item_name.lower().strip()
    today = purchased_date if purchased_date else date.today()
    
    # Clean item name - remove common prefixes/suffixes that don't affect category
    cleaned_name = re.sub(r'\b(organic|fresh|frozen|dried|raw|cooked|whole|low fat|fat free|reduced fat|light|lite)\b', '', item_name_lower)
    cleaned_name = re.sub(r'\s+', ' ', cleaned_name).strip()
    
    # Context clues to differentiate pepper (vegetable) vs pepper (spice)
    spice_context_words = ["flakes", "powder", "ground", "spice", "seasoning", "peppercorn", "cayenne", "crushed"]
    vegetable_context_words = ["bell", "fresh", "sweet", "chili pepper", "chile pepper", "jalapeño", "jalapeno", "serrano", "habanero", "poblano"]
    
    def is_likely_spice(name: str) -> bool:
        """Check if 'pepper' likely refers to spice based on context."""
        return any(word in name for word in spice_context_words)
    
    def is_likely_vegetable(name: str) -> bool:
        """Check if 'pepper' likely refers to vegetable based on context."""
        return any(word in name for word in vegetable_context_words)
    
    matched_category = None
    matched_days = None
    match_type = None  # "exact", "partial", "usda"
    best_match_score = 0
    
    # First, try to match using USDA food category if available
    if usda_food_category:
        usda_category_lower = usda_food_category.lower()
        for category, rules in EXPIRATION_RULES.items():
            usda_categories = rules.get("usda_categories", [])
            for usda_cat in usda_categories:
                if usda_cat.lower() in usda_category_lower or usda_category_lower in usda_cat.lower():
                    # Always record category/type on a USDA hit
                    matched_category = category
                    match_type = "usda"
                    # Get days based on storage type (may be None if storage doesn't apply)
                    if storage_type == "freezer" and rules.get("freezer") is not None:
                        matched_days = rules["freezer"]
                    elif storage_type == "fridge" and rules.get("fridge") is not None:
                        matched_days = rules["fridge"]
                    elif storage_type == "pantry" and rules.get("pantry") is not None:
                        matched_days = rules["pantry"]
                    break
            if match_type == "usda":
                break
    
    # If no USDA match, try keyword matching with improved logic
    if matched_days is None:
        for category, rules in EXPIRATION_RULES.items():
            for keyword in rules["keywords"]:
                keyword_lower = keyword.lower()
                
                # Use word boundaries for better matching (avoid "chicken" matching "chicken soup")
                # But allow partial matches for compound words
                pattern = r'\b' + re.escape(keyword_lower) + r'\b'
                if re.search(pattern, item_name_lower) or re.search(pattern, cleaned_name):
                    # Exact word match - highest priority
                    score = 10
                    match_type_candidate = "exact"
                elif keyword_lower in item_name_lower or keyword_lower in cleaned_name:
                    # Partial match - lower priority
                    score = 5
                    match_type_candidate = "partial"
                else:
                    continue
                
                # Context-aware scoring for ambiguous "red pepper" / "green pepper"
                if keyword_lower in ["red pepper", "green pepper"]:
                    # Boost score if context matches the category
                    if category == "spices" and is_likely_spice(item_name_lower):
                        score += 5  # Boost spice match
                    elif category == "produce_perishable" and is_likely_vegetable(item_name_lower):
                        score += 5  # Boost vegetable match
                    # Penalize mismatches
                    elif category == "spices" and is_likely_vegetable(item_name_lower):
                        score -= 3  # Penalize spice match when it's clearly a vegetable
                    elif category == "produce_perishable" and is_likely_spice(item_name_lower):
                        score -= 3  # Penalize vegetable match when it's clearly a spice
                
                # Only use this match if it's better than previous
                if score > best_match_score:
                    best_match_score = score
                    match_type = match_type_candidate
                    matched_category = category  # Always record category on keyword match
                    
                    # Get days based on storage type (may be None if storage doesn't apply)
                    if storage_type == "freezer" and rules.get("freezer") is not None:
                        matched_days = rules["freezer"]
                    elif storage_type == "fridge" and rules.get("fridge") is not None:
                        matched_days = rules["fridge"]
                    elif storage_type == "pantry" and rules.get("pantry") is not None:
                        matched_days = rules["pantry"]
                    else:
                        matched_days = None
                    
                    # For exact matches, we can break early
                    if match_type == "exact" and matched_days is not None:
                        break
        
        # If we found any match (even without days), re-check for more specific categories
        # (e.g., "ground beef" should match "meat_ground" not just "meat")
        if matched_category is not None:
            # Re-check for more specific categories (they come later in dict, so check again)
            for category, rules in EXPIRATION_RULES.items():
                # Skip if this is the category we already matched
                if category == matched_category:
                    continue
                    
                for keyword in rules["keywords"]:
                    keyword_lower = keyword.lower()
                    pattern = r'\b' + re.escape(keyword_lower) + r'\b'
                    
                    if re.search(pattern, item_name_lower) or re.search(pattern, cleaned_name):
                        # More specific match found — always update category
                        matched_category = category
                        match_type = "exact"
                        if storage_type == "freezer" and rules.get("freezer") is not None:
                            matched_days = rules["freezer"]
                        elif storage_type == "fridge" and rules.get("fridge") is not None:
                            matched_days = rules["fridge"]
                        elif storage_type == "pantry" and rules.get("pantry") is not None:
                            matched_days = rules["pantry"]
                        else:
                            matched_days = None
                        break
                if match_type == "exact" and matched_category != category:
                    break
    
    # If a category was matched but the current storage type has no shelf-life data,
    # we need to handle two cases:
    # 1. Auto-fill: Use recommended storage's days (for initial suggestion)
    # 2. User explicitly chose wrong storage: Use very short expiration (food safety)
    # 
    # We only penalize when the user chooses a LESS safe storage than recommended.
    # If they choose a MORE safe storage (e.g., freezer when fridge is recommended),
    # we use the more safe storage's shelf-life data (which is already set above).
    wrong_storage = False
    if matched_category is not None and matched_days is None:
        rec_storage = get_recommended_storage_type(matched_category)
        
        # Only penalize if chosen storage is LESS safe than recommended
        # (e.g., pantry when fridge is recommended = unsafe)
        # (e.g., freezer when fridge is recommended = safe, use freezer days)
        if rec_storage and rec_storage != storage_type:
            if is_less_safe_storage(storage_type, rec_storage):
                # Highly perishable categories in less safe storage = 1 day (food safety)
                highly_perishable = ["meat", "meat_ground", "seafood", "seafood_shellfish", "dairy", "dairy_soft", "eggs"]
                if matched_category in highly_perishable:
                    matched_days = 1  # Very short expiration for safety
                    wrong_storage = True
        # For other cases (or non-perishable in wrong storage), use recommended storage's days (for auto-fill)
        if matched_days is None and rec_storage:
            rec_days = EXPIRATION_RULES.get(matched_category, {}).get(rec_storage)
            if rec_days is not None:
                matched_days = rec_days

    # Determine confidence level
    if matched_days is not None:
        if wrong_storage:
            confidence = "low"  # Wrong storage = low confidence for food safety
        elif match_type == "usda" or match_type == "exact":
            confidence = "high"
        elif match_type == "partial":
            confidence = "medium"
        else:
            confidence = "medium"
        
        # Apply opened status adjustment
        if is_opened and matched_days is not None:
            # Categories that already have different rules for opened vs unopened items
            # These categories use different storage_type values for opened items
            categories_with_opened_rules = ["beverages", "condiments", "preserves", "baby_food"]
            
            # For categories with explicit opened rules, check if we need to adjust
            # Beverages: pantry (unopened) = 180, fridge (opened) = 7
            # Condiments: pantry (unopened) = 180, fridge (opened) = 90
            # Preserves: pantry (unopened) = 365, fridge (opened) = 180
            # Baby food: pantry (unopened) = 365, fridge (opened) = 3
            
            if matched_category in categories_with_opened_rules:
                # These categories have different values based on storage_type
                # If item is opened and in pantry, we should use fridge value instead
                if storage_type == "pantry" and matched_category == "beverages":
                    matched_days = 7  # Opened beverages in pantry should be refrigerated
                elif storage_type == "pantry" and matched_category == "condiments":
                    matched_days = 90  # Opened condiments should be refrigerated
                elif storage_type == "pantry" and matched_category == "preserves":
                    matched_days = 180  # Opened preserves should be refrigerated
                elif storage_type == "pantry" and matched_category == "baby_food":
                    matched_days = 3  # Opened baby food should be refrigerated
                # If already in fridge, the value is already correct
            elif matched_category in ["pantry_staples", "spices", "oils", "dry", "canned"]:
                # These items don't change much when opened (or are already long-lasting)
                # Apply minimal reduction (5-10%)
                matched_days = int(matched_days * 0.95)
            elif matched_category in ["dairy", "meat", "seafood", "produce_perishable", "produce_leafy", "produce_berries"]:
                # Perishable items: opened items spoil faster (reduce by 25-30%)
                matched_days = int(matched_days * 0.7)
            else:
                # General rule: opened items last 60-70% as long
                matched_days = int(matched_days * 0.65)
        
        suggested_date = today + timedelta(days=matched_days)
        recommended_storage = get_recommended_storage_type(matched_category)
        return suggested_date, confidence, matched_category, recommended_storage
    else:
        # Low confidence - no match found
        confidence = "low"
        # Default: 7 days for unknown items (conservative estimate)
        # But try to be smarter based on storage type
        if storage_type == "freezer":
            default_days = 90  # 3 months for frozen unknown items
        elif storage_type == "fridge":
            default_days = 7  # 1 week for refrigerated unknown items
        else:
            default_days = 7  # 1 week for pantry unknown items
        
        suggested_date = today + timedelta(days=default_days)
        return suggested_date, confidence, None, None

@app.post("/api/items/suggest-expiration", response_model=ExpirationSuggestionResponse)
async def suggest_expiration(request: ExpirationSuggestionRequest):
    """
    Suggest an expiration date for an item based on its name, storage type, and optional USDA data.
    """
    try:
        storage = request.storage_type or "pantry"
        
        # If USDA FDC ID is provided, try to get food category
        usda_category = request.usda_food_category
        if request.usda_fdc_id and not usda_category and USDA_API_KEY:
            try:
                # Fetch food category from USDA API
                url = f"https://api.nal.usda.gov/fdc/v1/food/{request.usda_fdc_id}?api_key={USDA_API_KEY}"
                async with httpx.AsyncClient() as client:
                    response = await client.get(url)
                    usda_data = response.json()
                    # Extract food category if available
                    food_category = usda_data.get("foodCategory", {})
                    if food_category:
                        usda_category = food_category.get("description", "")
            except Exception as e:
                logger.debug(f"Could not fetch USDA category for fdcId {request.usda_fdc_id}: {str(e)}")
        
        suggested_date, confidence, category, recommended_storage = suggest_expiration_date(
            request.name,
            storage,
            request.purchased_date,
            usda_category,
            request.is_opened or False
        )
        
        days_from_now = (suggested_date - date.today()).days if suggested_date else None
        
        return {
            "suggested_date": suggested_date.isoformat() if suggested_date else None,
            "days_from_now": days_from_now,
            "confidence": confidence,
            "category": category,
            "recommended_storage_type": recommended_storage
        }
    except Exception as e:
        logger.error(f"Error suggesting expiration date: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error suggesting expiration: {str(e)}")

# Profile/Account endpoints
@app.get("/api/profile", response_model=ProfileResponse)
def get_profile(user_id: Optional[str] = Depends(get_user_id)):
    """Get the current user's profile"""
    if not user_id:
        logger.warning("GET /api/profile - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching profile for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/api/profile", response_model=ProfileResponse)
def update_profile(profile_data: ProfileUpdate, user_id: Optional[str] = Depends(get_user_id)):
    """Update the current user's profile"""
    if not user_id:
        logger.warning("PUT /api/profile - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Build update data
    update_data = {}
    if profile_data.name is not None:
        update_data["name"] = profile_data.name
    if profile_data.email is not None:
        update_data["email"] = profile_data.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    try:
        logger.info(f"Updating profile for user {user_id} with data: {update_data}")
        response = supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        # Also update email in auth.users if email is being changed
        if profile_data.email:
            try:
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {"email": profile_data.email}
                )
            except Exception as e:
                logger.warning(f"Could not update email in auth.users: {str(e)}")
        
        logger.info(f"Profile updated successfully for user {user_id}")
        return response.data[0]
    except Exception as e:
        logger.error(f"Error updating profile for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/profile/change-password")
def change_password(password_data: PasswordChangeRequest, user_id: Optional[str] = Depends(get_user_id)):
    """Change the user's password"""
    if not user_id:
        logger.warning("POST /api/profile/change-password - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Get user email from profile
        profile_response = supabase.table("profiles").select("email").eq("id", user_id).execute()
        if not profile_response.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        user_email = profile_response.data[0].get("email")
        if not user_email:
            raise HTTPException(status_code=400, detail="User email not found")
        
        # Verify current password by attempting to sign in
        try:
            auth_response = supabase.auth.sign_in_with_password({
                "email": user_email,
                "password": password_data.current_password
            })
            if not auth_response.user:
                raise HTTPException(status_code=401, detail="Current password is incorrect")
        except HTTPException:
            raise
        except Exception as e:
            error_msg = str(e).lower()
            if "invalid" in error_msg or "credentials" in error_msg or "password" in error_msg:
                logger.warning(f"Password verification failed for user {user_id}")
                raise HTTPException(status_code=401, detail="Current password is incorrect")
            raise
        
        # Update password using Supabase Admin API via REST API directly
        # The Python client's admin API might have limitations, so we'll use REST API
        import httpx
        
        try:
            # Use Supabase REST API directly with service role key
            admin_url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
            headers = {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "password": password_data.new_password
            }
            
            # Make the API call
            with httpx.Client(timeout=10.0) as client:
                response = client.put(admin_url, json=payload, headers=headers)
                
                if response.status_code == 200:
                    logger.info(f"Password changed successfully for user {user_id} via REST API")
                elif response.status_code == 403 or response.status_code == 401:
                    logger.error(f"Permission denied for password change: {response.text}")
                    raise HTTPException(
                        status_code=403,
                        detail="Password change is not available. Please use the 'Forgot Password' feature to reset your password via email."
                    )
                else:
                    error_text = response.text
                    logger.error(f"Password change failed: {response.status_code} - {error_text}")
                    raise Exception(f"API returned {response.status_code}: {error_text}")
                    
        except HTTPException:
            raise
        except httpx.RequestError as e:
            logger.error(f"Network error during password change: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Network error while changing password. Please try again."
            )
        except Exception as e:
            error_msg = str(e).lower()
            logger.error(f"Password change failed for user {user_id}: {error_msg}")
            
            if "not allowed" in error_msg or "permission" in error_msg or "forbidden" in error_msg:
                raise HTTPException(
                    status_code=403,
                    detail="Password change is not available. Please use the 'Forgot Password' feature to reset your password via email."
                )
            
            raise HTTPException(
                status_code=500,
                detail=f"Failed to change password: {str(e)}"
            )
        
        logger.info(f"Password changed successfully for user {user_id}")
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password for user {user_id}: {str(e)}")
        error_msg = str(e).lower()
        if "not allowed" in error_msg:
            raise HTTPException(
                status_code=403,
                detail="Password change is currently unavailable. Please use the 'Forgot Password' feature or contact support."
            )
        raise HTTPException(status_code=500, detail=f"Failed to change password: {str(e)}")


@app.get("/api/profile/stats")
def get_profile_stats(user_id: Optional[str] = Depends(get_user_id)):
    """Get statistics about the user's account"""
    if not user_id:
        logger.warning("GET /api/profile/stats - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Get total items count
        items_response = supabase.table("items").select("id", count="exact").eq("user_id", user_id).execute()
        total_items = items_response.count if hasattr(items_response, 'count') and items_response.count is not None else len(items_response.data)
        
        # Get expiring items count (next 7 days)
        from datetime import timedelta
        today = date.today()
        future_date = today + timedelta(days=7)
        expiring_response = supabase.table("items").select("id", count="exact").eq("user_id", user_id).not_.is_("expiration_date", "null").gte("expiration_date", today.isoformat()).lte("expiration_date", future_date.isoformat()).execute()
        expiring_items = expiring_response.count if hasattr(expiring_response, 'count') and expiring_response.count is not None else len(expiring_response.data)
        
        # Get expired items count
        expired_response = supabase.table("items").select("id", count="exact").eq("user_id", user_id).not_.is_("expiration_date", "null").lt("expiration_date", today.isoformat()).execute()
        expired_items = expired_response.count if hasattr(expired_response, 'count') and expired_response.count is not None else len(expired_response.data)
        
        # Get profile to find account creation date
        profile_response = supabase.table("profiles").select("created_at").eq("id", user_id).execute()
        account_created = profile_response.data[0].get("created_at") if profile_response.data else None
        
        return {
            "total_items": total_items,
            "expiring_items": expiring_items,
            "expired_items": expired_items,
            "account_created": account_created
        }
    except Exception as e:
        logger.error(f"Error fetching stats for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# USDA Food API endpoints
@app.get("/api/food/search")
async def search_food(query: str):
    """Search USDA FoodData Central for foods"""
    if not USDA_API_KEY:
        raise HTTPException(status_code=500, detail="USDA API key not configured")
    
    logger.info(f"Searching USDA API for: {query}")
    try:
        url = f"https://api.nal.usda.gov/fdc/v1/foods/search?query={query}&pageSize=10&api_key={USDA_API_KEY}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            data = response.json()
            foods = data.get("foods", [])
            logger.info(f"Found {len(foods)} results for query: {query}")
            return foods
    except Exception as e:
        logger.error(f"Error searching USDA API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"USDA API error: {str(e)}")


# -----------------------------------------------------------------------------
# Price compare (Apify Instacart scraper – hybrid grocery price source)
# -----------------------------------------------------------------------------
@app.get("/api/price-compare")
def price_compare(
    query: str = Query(..., description="Item/search term"),
    zip: str = Query(..., description="ZIP code for store area"),
):
    """
    Compare grocery prices via Apify Instacart scraper.
    Returns normalized results and cheapest item; uses usage guard and cache.
    When Apify is disabled (usage limit), returns empty results with reason.
    """
    from .services.apify_client import can_use_apify, cached_search

    query = (query or "").strip()
    zip_code = (zip or "").strip()
    if not query or not zip_code:
        raise HTTPException(status_code=400, detail="query and zip are required")

    apify_enabled, reason = can_use_apify()
    if not apify_enabled:
        logger.info("Price compare: Apify disabled - %s", reason)
        return {
            "query": query,
            "zip": zip_code,
            "cheapest": None,
            "results": [],
            "source_status": {
                "apify_enabled": False,
                "reason": reason,
                "used_cache": False,
            },
        }

    try:
        results, used_cache, err = cached_search(query, zip_code)
    except Exception as e:
        logger.error("Price compare error: %s", type(e).__name__)
        return {
            "query": query,
            "zip": zip_code,
            "cheapest": None,
            "results": [],
            "source_status": {
                "apify_enabled": True,
                "reason": "Search failed",
                "used_cache": False,
            },
        }

    if err:
        return {
            "query": query,
            "zip": zip_code,
            "cheapest": None,
            "results": [],
            "source_status": {
                "apify_enabled": True,
                "reason": err,
                "used_cache": False,
            },
        }

    cheapest = None
    if results:
        by_price = sorted(results, key=lambda x: (x.get("price") or 0))
        cheapest = by_price[0]

    return {
        "query": query,
        "zip": zip_code,
        "cheapest": cheapest,
        "results": results,
        "source_status": {
            "apify_enabled": True,
            "reason": "OK",
            "used_cache": used_cache,
        },
    }


@app.post("/api/items/from-usda")
async def create_item_from_usda(
    usda_fdc_id: int,
    name: str,
    quantity: int = 1,
    expiration_date: Optional[str] = None,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Create pantry item with USDA nutritional data"""
    if not user_id:
        logger.warning("POST /api/items/from-usda - Authentication required")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    if not USDA_API_KEY:
        raise HTTPException(status_code=500, detail="USDA API key not configured")
    
    try:
        # Fetch nutrition from USDA API
        logger.info(f"Fetching USDA data for fdcId: {usda_fdc_id}")
        url = f"https://api.nal.usda.gov/fdc/v1/food/{usda_fdc_id}?api_key={USDA_API_KEY}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            usda_data = response.json()
        
        # Extract nutrition from labelNutrients
        label = usda_data.get("labelNutrients", {})
        
        # Create item with nutritional data
        new_item = {
            "user_id": user_id,
            "name": name,
            "quantity": quantity,
            "expiration_date": expiration_date,
            "usda_fdc_id": usda_fdc_id,
            "calories": label.get("calories", {}).get("value", 0),
            "protein": label.get("protein", {}).get("value", 0),
            "carbs": label.get("carbohydrates", {}).get("value", 0),
            "fat": label.get("fat", {}).get("value", 0),
        }
        
        result = supabase.table("items").insert(new_item).execute()
        logger.info(f"Item created from USDA: {result.data[0].get('id')} for user: {user_id}")
        return result.data[0]
    except Exception as e:
        logger.error(f"Error creating item from USDA for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# Spoonacular recipe API (proxy to keep API key server-side)
@app.get("/api/recipes/by-ingredients")
async def get_recipes_by_ingredients(
    user_id: Optional[str] = Depends(get_user_id),
    ingredients: str = Query(..., description="Comma-separated list of ingredients"),
    number: int = Query(12, ge=1, le=100, description="Number of recipes to return"),
    ranking: int = Query(1, description="1=maximize used ingredients, 2=minimize missing"),
    diet: Optional[str] = Query(None, description="Diet filter: vegetarian, vegan, gluten free"),
    prioritize_expiring: bool = Query(False, description="Sort recipes to prioritize soon-to-expire pantry items"),
    household_id: Optional[str] = Query(None, description="Household ID for expiring-soon lookup when prioritize_expiring is true"),
):
    """Get recipe suggestions from Spoonacular by pantry ingredients. Requires auth."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not SPOONACULAR_API_KEY:
        raise HTTPException(status_code=500, detail="Recipe API not configured")
    ingredients_clean = ",".join(s.strip() for s in ingredients.split(",") if s.strip())
    if not ingredients_clean:
        return {"recipes": []}
    try:
        if diet:
            # complexSearch supports includeIngredients + diet; fillIngredients gives used/missed per recipe
            url = "https://api.spoonacular.com/recipes/complexSearch"
            params = {
                "apiKey": SPOONACULAR_API_KEY,
                "includeIngredients": ingredients_clean,
                "diet": diet,
                "number": number,
                "addRecipeInformation": "true",
                "fillIngredients": "true",
            }
        else:
            url = "https://api.spoonacular.com/recipes/findByIngredients"
            params = {
                "apiKey": SPOONACULAR_API_KEY,
                "ingredients": ingredients_clean,
                "number": number,
                "ranking": ranking,
                "ignorePantry": "true",
            }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        if diet:
            results = data.get("results", [])
        else:
            results = data if isinstance(data, list) else []
        if not results:
            return {"recipes": []}
        ids = [r["id"] for r in results]
        # Get full recipe info (readyInMinutes, servings, sourceUrl, summary)
        ids_param = ",".join(str(i) for i in ids[:25])
        info_url = "https://api.spoonacular.com/recipes/informationBulk"
        info_params = {"apiKey": SPOONACULAR_API_KEY, "ids": ids_param}
        async with httpx.AsyncClient(timeout=15.0) as client:
            info_resp = await client.get(info_url, params=info_params)
            info_resp.raise_for_status()
            info_list = info_resp.json()
        info_by_id = {int(r["id"]): r for r in info_list}
        recipes_out = []
        for r in results:
            rid = r["id"]
            info = info_by_id.get(rid, {})
            missed_list = r.get("missedIngredients") if isinstance(r.get("missedIngredients"), list) else []
            used_list = r.get("usedIngredients") if isinstance(r.get("usedIngredients"), list) else []
            # Derive counts from actual arrays so displayed count always matches the list
            missed_count = len(missed_list) if missed_list else r.get("missedIngredientCount", 0)
            used_count = len(used_list) if used_list else r.get("usedIngredientCount", 0)
            recipes_out.append({
                "id": rid,
                "title": r.get("title") or info.get("title", ""),
                "image": r.get("image") or info.get("image"),
                "usedIngredientCount": used_count,
                "missedIngredientCount": missed_count,
                "missedIngredients": missed_list,
                "usedIngredients": used_list,
                "readyInMinutes": info.get("readyInMinutes"),
                "servings": info.get("servings"),
                "sourceUrl": info.get("sourceUrl"),
                "summary": info.get("summary"),
            })
        # Optionally prioritize recipes that use soon-to-expire pantry items
        if prioritize_expiring and recipes_out:
            try:
                if household_id:
                    member_check = supabase.table("relation_househould").select("*").eq("user_id", user_id).eq("household_id", household_id).execute()
                    if not member_check.data:
                        household_id = None
                if not household_id:
                    hh = supabase.table("relation_househould").select("household_id").eq("user_id", user_id).limit(1).execute()
                    household_id = hh.data[0]["household_id"] if hh.data else None
                if household_id:
                    members = supabase.table("relation_househould").select("user_id").eq("household_id", household_id).execute()
                    user_ids = [m["user_id"] for m in members.data]
                    today = date.today()
                    from datetime import timedelta
                    soon = today + timedelta(days=7)
                    expiring = supabase.table("items").select("name").in_("user_id", user_ids).not_.is_("expiration_date", "null").gte("expiration_date", today.isoformat()).lte("expiration_date", soon.isoformat()).execute()
                    expiring_names = { (i.get("name") or "").strip().lower() for i in (expiring.data or []) if (i.get("name") or "").strip() }
                    def score_recipe(rec):
                        used = rec.get("usedIngredients") or []
                        names = [ (u.get("name") or "").strip().lower() for u in used if (u.get("name") or "").strip() ]
                        return sum(1 for n in names if n in expiring_names)
                    recipes_out.sort(key=score_recipe, reverse=True)
            except Exception as e:
                logger.warning(f"Could not prioritize by expiring items: {e}")
        return {"recipes": recipes_out}
    except httpx.HTTPStatusError as e:
        logger.error(f"Spoonacular API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=502, detail="Recipe service error")
    except Exception as e:
        logger.error(f"Error fetching recipes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching recipes: {str(e)}")


@app.post("/api/receipt/scan")
async def scan_receipt(
        file: UploadFile = File(...),
        user_id: Optional[str] = Depends(get_user_id)
):
    """Scan receipt image using OpenAI Vision API"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API not configured")

    try:
        # Read the uploaded image as bytes
        image_data = await file.read()

        # Convert bytes to base64
        base64_image = base64.b64encode(image_data).decode('utf-8')

        logger.info(f"Receipt image received: size: {len(image_data)} bytes")

        # Call OpenAI Vision API with improved prompt
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at reading grocery receipts. Extract ONLY food and beverage items. Be precise."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Read this receipt and extract food/beverage items.

RULES:
1. ONLY food/drinks - NO bags, cleaning supplies, etc.
2. Remove ALL brand names (Kraft, Dole, etc.)
3. Expand abbreviations: QTR→Quarter, LT→Light, OZ→Ounce
4. Use proper case: "Milk" not "MILK"
5. If quantity unclear, use 1
6. Combine duplicates

EXAMPLES:
"KRAFT CHEDDAR 8OZ" → {"name": "Cheddar Cheese", "quantity": 1}
"BANANAS 2LB" → {"name": "Bananas", "quantity": 2}

Return ONLY JSON array:
[{\"name\": \"Butter\", \"quantity\": 2}]"""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000,
            temperature=0.1
        )

        # Extract items from response
        content = response.choices[0].message.content
        logger.info(f"GPT-4 raw response: {content}")

        # Extract JSON from response (GPT sometimes adds extra text)
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            content = json_match.group(0)
        else:
            logger.error(f"No JSON array found in response: {content}")
            raise ValueError("Could not find JSON array in response")

        items = json.loads(content)

        # Insert items into database
        added_items = []
        for item in items:
            new_item = {
                "user_id": user_id,
                "name": item.get("name", ""),
                "quantity": item.get("quantity", 1)
            }

            # Try to get USDA data with cleaned search term
            if USDA_API_KEY:
                try:
                    # Clean item name for better USDA matching
                    search_name = item.get('name', '').lower()
                    # Remove common abbreviations and brand-specific terms
                    search_name = search_name.replace('qtrs', 'quarters').replace('lt', 'light').replace('crm', 'cream')
                    search_name = search_name.replace('eng', 'english').replace('unc', 'uncured')
                    # Remove extra spaces
                    search_name = ' '.join(search_name.split())

                    usda_url = f"https://api.nal.usda.gov/fdc/v1/foods/search?query={search_name}&pageSize=1&api_key={USDA_API_KEY}"
                    async with httpx.AsyncClient() as client:
                        usda_response = await client.get(usda_url)
                        usda_data = usda_response.json()
                        if usda_data.get("foods"):
                            food = usda_data["foods"][0]
                            fdc_id = food.get("fdcId")
                            usda_name = food.get("description", item.get('name', ''))
                            new_item["usda_fdc_id"] = fdc_id
                            new_item["name"] = usda_name
                            logger.info(f"Matched '{item.get('name')}' to USDA: '{usda_name}' (fdcId: {fdc_id})")
                        else:
                            logger.info(f"No USDA match for '{item.get('name')}' (searched: '{search_name}')")
                except Exception as e:
                    logger.warning(f"USDA lookup failed for '{item.get('name')}': {str(e)}")

            result = supabase.table("items").insert(new_item).execute()
            added_items.append(result.data[0])

        logger.info(f"Added {len(added_items)} items to pantry for user {user_id}")
        return {"items": added_items, "count": len(added_items)}


    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse OpenAI response: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to parse receipt data")
    except Exception as e:
        logger.error(f"Error scanning receipt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scanning receipt: {str(e)}")

@app.post("/api/receipt/create-session")
async def create_scan_session(
    user_id: Optional[str] = Depends(get_user_id)
):
    """Create a scan session and return a token for mobile scanning"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Generate unique token
    token = str(uuid.uuid4())
    
    # Store session
    scan_sessions[token] = {
        "user_id": user_id,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "result": None
    }
    
    logger.info(f"Created scan session {token} for user {user_id}")
    return {"token": token}


@app.post("/api/receipt/scan-mobile")
async def scan_receipt_mobile(
    file: UploadFile = File(...),
    token: str = Query(...)
):
    """Scan receipt from mobile device using token"""
    if token not in scan_sessions:
        raise HTTPException(status_code=404, detail="Invalid scan token")
    
    session = scan_sessions[token]
    user_id = session["user_id"]
    
    if session["status"] != "pending":
        raise HTTPException(status_code=400, detail="Scan session already completed")
    
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API not configured")
    
    try:
        # Read the uploaded image as bytes
        image_data = await file.read()
        
        # Convert bytes to base64
        base64_image = base64.b64encode(image_data).decode('utf-8')
        
        logger.info(f"Mobile receipt image received: size: {len(image_data)} bytes for session {token}")
        
        # Call OpenAI Vision API
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Extract all food items from this receipt. Return ONLY a JSON array like: [{\"name\": \"Milk\", \"quantity\": 2}, {\"name\": \"Bread\", \"quantity\": 1}]"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )
        
        # Extract items from response
        content = response.choices[0].message.content
        logger.info(f"GPT-4 raw response: {content}")
        
        # Extract JSON from response (GPT sometimes adds extra text)
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            content = json_match.group(0)
        else:
            logger.error(f"No JSON array found in response: {content}")
            raise ValueError("Could not find JSON array in response")
        
        items = json.loads(content)

        # Insert items into database
        added_items = []
        for item in items:
            new_item = {
                "user_id": user_id,
                "name": item.get("name", ""),
                "quantity": item.get("quantity", 1)
            }

            # Try to get USDA data with cleaned search term
            if USDA_API_KEY:
                try:
                    # Clean item name for better USDA matching
                    search_name = item.get('name', '').lower()
                    # Remove common abbreviations and brand-specific terms
                    search_name = search_name.replace('qtrs', 'quarters').replace('lt', 'light').replace('crm', 'cream')
                    search_name = search_name.replace('eng', 'english').replace('unc', 'uncured')
                    # Remove extra spaces
                    search_name = ' '.join(search_name.split())
                    
                    usda_url = f"https://api.nal.usda.gov/fdc/v1/foods/search?query={search_name}&pageSize=1&api_key={USDA_API_KEY}"
                    async with httpx.AsyncClient() as client:
                        usda_response = await client.get(usda_url)
                        usda_data = usda_response.json()
                        if usda_data.get("foods"):
                            food = usda_data["foods"][0]
                            fdc_id = food.get("fdcId")
                            usda_name = food.get("description", item.get('name', ''))
                            new_item["usda_fdc_id"] = fdc_id
                            new_item["name"] = usda_name
                            logger.info(f"Matched '{item.get('name')}' to USDA: '{usda_name}' (fdcId: {fdc_id})")
                        else:
                            logger.info(f"No USDA match for '{item.get('name')}' (searched: '{search_name}')")
                except Exception as e:
                    logger.warning(f"USDA lookup failed for '{item.get('name')}': {str(e)}")

            result = supabase.table("items").insert(new_item).execute()
            added_items.append(result.data[0])

        logger.info(f"Added {len(added_items)} items to pantry for user {user_id} via mobile scan")
        
        # Update session with result
        scan_sessions[token]["status"] = "completed"
        scan_sessions[token]["result"] = {
            "items": added_items,
            "count": len(added_items)
        }
        scan_sessions[token]["completed_at"] = datetime.now().isoformat()
        
        return {"success": True, "items": added_items, "count": len(added_items)}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse OpenAI response: {str(e)}")
        scan_sessions[token]["status"] = "error"
        scan_sessions[token]["result"] = {"error": "Failed to parse receipt data"}
        raise HTTPException(status_code=500, detail="Failed to parse receipt data")
    except Exception as e:
        logger.error(f"Error scanning receipt: {str(e)}")
        scan_sessions[token]["status"] = "error"
        scan_sessions[token]["result"] = {"error": str(e)}
        raise HTTPException(status_code=500, detail=f"Error scanning receipt: {str(e)}")


@app.get("/api/receipt/scan-result/{token}")
async def get_scan_result(
    token: str,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Get scan result by token"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    if token not in scan_sessions:
        raise HTTPException(status_code=404, detail="Scan session not found")
    
    session = scan_sessions[token]
    
    # Verify user owns this session
    if session["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if session["status"] == "pending":
        return {"status": "pending", "result": None}
    
    return {
        "status": session["status"],
        "result": session["result"]
    }

@app.get("/api/households")
def get_user_households(user_id: Optional[str] = Depends(get_user_id)):
    """Get all households the user belongs to"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        response = supabase.table("relation_househould").select("household_id, household(id, name)").eq("user_id", user_id).execute()
        households = [{"id": r["household"]["id"], "name": r["household"]["name"]} for r in response.data if r.get("household")]
        return {"households": households}
    except Exception as e:
        logger.error(f"Error fetching households for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
@app.post("/api/households")
async def create_household(
    name: str,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Create a new household"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        # Check if user already has a household
        household_response = supabase.table("household").select("*").eq("admin_id", user_id).execute()
        if household_response.data:
            raise HTTPException(status_code=400, detail="User already belongs to a household")

        # Create new household
        new_household = {
            "name": name,
            "admin_id": user_id
        }
        household_result = supabase.table("household").insert(new_household).execute()

        # Add user to household members
        member_data = {
            "household_id": household_result.data[0]["id"],
            "user_id": user_id
        }
        supabase.table("relation_househould").insert(member_data).execute()

        logger.info(f"Household '{name}' created for user {user_id}")
        return household_result.data[0]
    except Exception as e:
        logger.error(f"Error creating household for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating household: {str(e)}")

@app.post("/api/households/join")
def join_household(
    request: JoinHouseholdRequest,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Join an existing household"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Check if household exists
        household_response = supabase.table("household").select("*").eq("id", request.household_id).execute()
        if not household_response.data:
            raise HTTPException(status_code=404, detail="Household not found")
        
        # Check if user is already in this household
        existing = supabase.table("relation_househould").select("*").eq("user_id", user_id).eq("household_id", request.household_id).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Already in this household")
        
        # Add user to household
        supabase.table("relation_househould").insert({
            "user_id": user_id,
            "household_id": request.household_id
        }).execute()
        
        logger.info(f"User {user_id} joined household {request.household_id}")
        return {"message": "Successfully joined household", "household_id": request.household_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining household: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/api/households/{household_id}/members")
def get_household_members(
    household_id: str,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Get all members of a household"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Verify user is in this household
        member_check = supabase.table("relation_househould").select("*").eq("user_id", user_id).eq("household_id", household_id).execute()
        if not member_check.data:
            raise HTTPException(status_code=403, detail="Not a member of this household")
        
        # Get all members
        members_response = supabase.table("relation_househould").select("user_id, profiles(name, email)").eq("household_id", household_id).execute()
        members = [{"id": m["user_id"], "name": m["profiles"]["name"], "email": m["profiles"]["email"]} for m in members_response.data if m.get("profiles")]
        return {"members": members}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching household members: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.put("/api/households/{household_id}")
def update_household(
    household_id: str,
    name: str,
    user_id: Optional[str] = Depends(get_user_id)
):
    """Update household name"""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Verify user is in this household
        member_check = supabase.table("relation_househould").select("*").eq("user_id", user_id).eq("household_id", household_id).execute()
        if not member_check.data:
            raise HTTPException(status_code=403, detail="Not a member of this household")
        
        # Update household name
        result = supabase.table("household").update({"name": name}).eq("id", household_id).execute()
        logger.info(f"Household {household_id} renamed to '{name}' by user {user_id}")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating household: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# Admin endpoints for user management
@app.delete("/api/admin/users/{user_email}")
def delete_user_by_email(user_email: str):
    """
    Admin endpoint to delete a user by email.
    Deletes user from Supabase Auth and all related data.
    """
    try:
        # Find user by email using Supabase Auth admin API
        # First, try to get user by email using REST API
        import httpx
        
        admin_url = f"{SUPABASE_URL}/auth/v1/admin/users"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json"
        }
        
        user_id = None
        
        # Search for user by email
        try:
            with httpx.Client(timeout=10.0) as client:
                # Get all users (with pagination if needed)
                response = client.get(admin_url, headers=headers, params={"per_page": 1000})
                if response.status_code == 200:
                    users_data = response.json()
                    for user in users_data.get("users", []):
                        if user.get("email") == user_email:
                            user_id = user.get("id")
                            break
        except Exception as api_error:
            logger.error(f"Error searching for user via REST API: {str(api_error)}")
            raise HTTPException(status_code=500, detail=f"Could not search for user: {str(api_error)}")
        
        if not user_id:
            raise HTTPException(status_code=404, detail=f"User with email {user_email} not found")
        
        user_id = str(user_id)
        logger.info(f"Found user {user_email} with ID {user_id}, deleting...")
        
        # Delete user from Supabase Auth
        try:
            supabase.auth.admin.delete_user(user_id)
            logger.info(f"Deleted user {user_id} from Supabase Auth")
        except Exception as delete_error:
            logger.error(f"Error deleting user from Auth: {str(delete_error)}")
            raise HTTPException(status_code=500, detail=f"Could not delete user from Auth: {str(delete_error)}")
        
        # Clean up related data
        try:
            supabase.table("profiles").delete().eq("id", user_id).execute()
            logger.info(f"Deleted profile for user {user_id}")
        except Exception as e:
            logger.warning(f"Could not delete profile: {str(e)}")
        
        try:
            supabase.table("relation_househould").delete().eq("user_id", user_id).execute()
            logger.info(f"Deleted household relations for user {user_id}")
        except Exception as e:
            logger.warning(f"Could not delete household relations: {str(e)}")
        
        try:
            supabase.table("items").delete().eq("user_id", user_id).execute()
            logger.info(f"Deleted items for user {user_id}")
        except Exception as e:
            logger.warning(f"Could not delete items: {str(e)}")
        
        return {
            "message": f"User {user_email} deleted successfully",
            "user_id": user_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_email}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting user: {str(e)}")

@app.get("/api/admin/users")
def list_all_users():
    """
    Admin endpoint to list all users.
    Shows users from both Supabase Auth and profiles table.
    """
    try:
        import httpx
        
        admin_url = f"{SUPABASE_URL}/auth/v1/admin/users"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json"
        }
        
        auth_users = []
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(admin_url, headers=headers, params={"per_page": 1000})
                if response.status_code == 200:
                    users_data = response.json()
                    for user in users_data.get("users", []):
                        auth_users.append({
                            "id": user.get("id"),
                            "email": user.get("email"),
                            "created_at": user.get("created_at"),
                            "email_confirmed": user.get("email_confirmed_at") is not None,
                            "last_sign_in": user.get("last_sign_in_at")
                        })
        except Exception as api_error:
            logger.warning(f"Could not fetch users from Auth API: {str(api_error)}")
        
        # Also get users from profiles table
        try:
            profiles = supabase.table("profiles").select("*").execute()
            profile_users = [{"id": p["id"], "email": p["email"], "name": p["name"], "source": "profiles"} for p in profiles.data]
        except Exception as e:
            logger.warning(f"Could not fetch profiles: {str(e)}")
            profile_users = []
        
        return {
            "auth_users": {
                "total": len(auth_users),
                "users": auth_users
            },
            "profile_users": {
                "total": len(profile_users),
                "users": profile_users
            }
        }
    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing users: {str(e)}")

# Health check endpoint
@app.get("/health")
def health():
    try:
        # Test Supabase connection
        result = supabase.table("items").select("id").limit(1).execute()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
