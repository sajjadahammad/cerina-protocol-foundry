"""Helper utilities for protocol operations."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.protocol import Protocol, User


def get_protocol_or_404(
    db: Session,
    protocol_id: str,
    user_id: str = None,
    check_ownership: bool = False
) -> Protocol:
    """Get a protocol by ID, optionally checking ownership.
    
    Args:
        db: Database session
        protocol_id: Protocol ID
        user_id: User ID to check ownership against
        check_ownership: Whether to verify the protocol belongs to the user
        
    Returns:
        Protocol instance
        
    Raises:
        HTTPException: If protocol not found or ownership check fails
    """
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    if check_ownership and user_id and protocol.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this protocol"
        )
    
    return protocol


def verify_protocol_status(protocol: Protocol, required_status: str, error_message: str = None):
    """Verify that a protocol has the required status.
    
    Args:
        protocol: Protocol instance
        required_status: Required status value
        error_message: Custom error message (optional)
        
    Raises:
        HTTPException: If protocol status doesn't match
    """
    if protocol.status != required_status:
        message = error_message or f"Protocol is not {required_status} (current status: {protocol.status})"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

