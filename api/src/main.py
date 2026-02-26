import os
import logging
import base64
import json
import re
import time
import httpx
from datetime import date, datetime
from uuid import UUID
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Header, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
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

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is required")
if not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")


# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Initialize the Openai client w/ key
from openai import OpenAI
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

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

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    expiration_date: Optional[date] = None

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

class JoinHouseholdRequest(BaseModel):
    household_id: str

class ItemResponse(BaseModel):
    id: str
    user_id: str
    name: str
    quantity: int
    expiration_date: Optional[str] = None
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
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
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
    print("=== FASTAPI SERVER STARTING ===")
    print(f"Supabase URL: {SUPABASE_URL}")
    print(f"Service Key: {SUPABASE_SERVICE_KEY[:20]}...")
    
    try:
        print("Testing Supabase connection...")
        # Simple test query
        result = supabase.table("profiles").select("id").limit(1).execute()
        print("✓ Supabase connection successful")
    except Exception as e:
        print(f"✗ Supabase connection failed: {e}")
    
    print("=== SERVER READY ===")

@app.get("/test")
def test_endpoint():
    print("TEST ENDPOINT CALLED")
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
        logger.info(f"Creating item '{item_data.name}' (qty: {item_data.quantity}) for user: {user_id}")
        new_item = {
            "user_id": user_id,
            "name": item_data.name,
            "quantity": item_data.quantity,
            "expiration_date": item_data.expiration_date.isoformat() if item_data.expiration_date else None
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

# Health check endpoint
@app.get("/health")
def health():
    try:
        # Test Supabase connection
        result = supabase.table("items").select("id").limit(1).execute()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

