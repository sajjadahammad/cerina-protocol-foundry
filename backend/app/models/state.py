"""Pydantic schemas for API requests and responses."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


# Authentication Schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    avatar: Optional[str] = None
    
    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    user: UserResponse
    token: str
    
    class Config:
        from_attributes = True
    
    class Config:
        from_attributes = True


# Protocol Schemas
class ProtocolVersionSchema(BaseModel):
    version: int
    content: str
    timestamp: datetime
    author: str
    
    class Config:
        from_attributes = True


class SafetyScoreSchema(BaseModel):
    score: int
    flags: List[str]
    notes: str


class EmpathyMetricsSchema(BaseModel):
    score: int
    tone: str
    suggestions: List[str]


class AgentThoughtSchema(BaseModel):
    id: str
    agentRole: str
    agentName: str
    content: str
    timestamp: datetime
    type: str
    
    @classmethod
    def from_orm(cls, obj):
        """Convert ORM object to schema."""
        return cls(
            id=obj.id,
            agentRole=obj.agent_role,
            agentName=obj.agent_name,
            content=obj.content,
            timestamp=obj.timestamp,
            type=obj.type,
        )
    
    class Config:
        from_attributes = True


class ProtocolResponse(BaseModel):
    id: str
    title: str
    intent: str
    currentDraft: str
    versions: List[ProtocolVersionSchema]
    status: str
    safetyScore: SafetyScoreSchema
    empathyMetrics: EmpathyMetricsSchema
    iterationCount: int
    agentThoughts: List[AgentThoughtSchema]
    createdAt: datetime
    updatedAt: datetime
    approvedAt: Optional[datetime] = None
    approvedBy: Optional[str] = None
    
    @classmethod
    def from_orm(cls, obj):
        """Convert ORM object to schema."""
        return cls(
            id=obj.id,
            title=obj.title,
            intent=obj.intent,
            currentDraft=obj.current_draft,
            versions=[ProtocolVersionSchema.from_orm(v) for v in obj.versions],
            status=obj.status,
            safetyScore=SafetyScoreSchema(**obj.safety_score) if isinstance(obj.safety_score, dict) else SafetyScoreSchema(score=0, flags=[], notes=""),
            empathyMetrics=EmpathyMetricsSchema(**obj.empathy_metrics) if isinstance(obj.empathy_metrics, dict) else EmpathyMetricsSchema(score=0, tone="", suggestions=[]),
            iterationCount=obj.iteration_count,
            agentThoughts=[AgentThoughtSchema.from_orm(t) for t in obj.agent_thoughts],
            createdAt=obj.created_at,
            updatedAt=obj.updated_at,
            approvedAt=obj.approved_at,
            approvedBy=obj.approved_by,
        )
    
    class Config:
        from_attributes = True


class CreateProtocolRequest(BaseModel):
    intent: str
    type: str


class ApproveProtocolRequest(BaseModel):
    editedContent: Optional[str] = None


class RejectProtocolRequest(BaseModel):
    reason: str

