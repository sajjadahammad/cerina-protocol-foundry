# Connecting Cerina Protocol Foundry MCP Server to Claude Desktop

This guide explains how to connect your Cerina Protocol Foundry MCP server to Claude Desktop.

## Prerequisites

1. **Claude Desktop** installed on your system
2. **Python virtual environment** set up with all dependencies installed
3. **Backend environment** configured (`.env` file with API keys)

## Step 1: Locate Claude Desktop Config File

The configuration file location depends on your operating system:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
  - Full path: `C:\Users\<YourUsername>\AppData\Roaming\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Step 2: Find Your Python Executable Path

You need the full path to your Python executable in the virtual environment:

**Windows:**
```powershell
# From the backend directory
cd backend
.\venv\Scripts\python.exe --version
# Note the full path, e.g., D:\projects\cerina-protocol-foundry\backend\venv\Scripts\python.exe
```

**macOS/Linux:**
```bash
# From the backend directory
cd backend
which python  # or: source venv/bin/activate && which python
# Note the full path
```

## Step 3: Configure Claude Desktop

1. **Open or create** the `claude_desktop_config.json` file
2. **Add** the following configuration (adjust paths for your system):

### Windows Configuration

```json
{
  "mcpServers": {
    "cerina-foundry": {
      "command": "D:\\projects\\cerina-protocol-foundry\\backend\\venv\\Scripts\\python.exe",
      "args": [
        "-m",
        "app.mcp.server"
      ],
      "cwd": "D:\\projects\\cerina-protocol-foundry\\backend",
      "env": {
        "PYTHONPATH": "D:\\projects\\cerina-protocol-foundry\\backend"
      }
    }
  }
}
```

### macOS/Linux Configuration

```json
{
  "mcpServers": {
    "cerina-foundry": {
      "command": "/full/path/to/backend/venv/bin/python",
      "args": [
        "-m",
        "app.mcp.server"
      ],
      "cwd": "/full/path/to/cerina-protocol-foundry/backend",
      "env": {
        "PYTHONPATH": "/full/path/to/cerina-protocol-foundry/backend"
      }
    }
  }
}
```

### Important Notes:

- **Replace paths** with your actual project paths
- **Use forward slashes** on macOS/Linux, **backslashes** on Windows (or escape them: `\\`)
- **Ensure** the `cwd` (current working directory) points to the `backend` folder
- **Set PYTHONPATH** to the backend directory so Python can find the `app` module

## Step 4: Add Environment Variables (REQUIRED)

**IMPORTANT:** The MCP server needs API keys to function. You have two options:

### Option 1: Add API Keys to Claude Desktop Config (Recommended)

Add your API keys directly to the `env` section in Claude Desktop config:

**For Mistral AI (Recommended):**
```json
{
  "mcpServers": {
    "cerina-foundry": {
      "command": "D:\\projects\\cerina-protocol-foundry\\backend\\venv\\Scripts\\python.exe",
      "args": [
        "-m",
        "app.mcp.server"
      ],
      "cwd": "D:\\projects\\cerina-protocol-foundry\\backend",
      "env": {
        "PYTHONPATH": "D:\\projects\\cerina-protocol-foundry\\backend",
        "MISTRAL_API_KEY": "your-mistral-api-key-here",
        "LLM_PROVIDER": "mistral",
        "MISTRAL_MODEL": "mistral-large-latest",
      }
    }
  }
}
```

**Or if using Hugging Face:**
```json
"env": {
  "PYTHONPATH": "D:\\projects\\cerina-protocol-foundry\\backend",
  "HUGGINGFACE_API_KEY": "your-huggingface-api-key-here",
  "LLM_PROVIDER": "huggingface",
  "HUGGINGFACE_MODEL": "Qwen/Qwen2.5-72B-Instruct",
  "DATABASE_URL": "sqlite:///./cerina_foundry.db",
  "SECRET_KEY": "your-secret-key"
}
```

### Option 2: Use a `.env` File

Create a `.env` file in the `backend` directory with your API keys:

**For Mistral AI:**
```env
MISTRAL_API_KEY=your-mistral-api-key-here
LLM_PROVIDER=mistral
MISTRAL_MODEL=mistral-large-latest
DATABASE_URL=sqlite:///./cerina_foundry.db
SECRET_KEY=your-secret-key
```

**Or for Hugging Face:**
```env
HUGGINGFACE_API_KEY=your-huggingface-api-key-here
LLM_PROVIDER=huggingface
HUGGINGFACE_MODEL=Qwen/Qwen2.5-72B-Instruct
DATABASE_URL=sqlite:///./cerina_foundry.db
SECRET_KEY=your-secret-key
```

The MCP server will automatically load this file. However, **Option 1 is more reliable** because Claude Desktop may not set the working directory correctly.

## Step 5: Restart Claude Desktop

After saving the configuration file:

1. **Close** Claude Desktop completely
2. **Restart** Claude Desktop
3. The MCP server should automatically start when Claude Desktop launches

## Step 6: Verify Connection

1. **Open** Claude Desktop
2. **Check** the MCP server status (usually shown in Claude Desktop's settings or status bar)
3. **Try using the tool** by asking Claude to create a CBT protocol:

```
Can you create a CBT protocol for treating anxiety using the create_cbt_protocol tool?
```

Or be more specific:

```
Use the create_cbt_protocol tool to create an exposure hierarchy protocol for a patient with social anxiety. The intent is to help them gradually face social situations, starting with low-anxiety scenarios like making eye contact with a cashier, progressing to moderate scenarios like asking a stranger for directions, and eventually reaching high-anxiety scenarios like giving a presentation.
```

## Troubleshooting

### MCP Server Not Connecting

1. **Check the config file syntax** - Ensure valid JSON (no trailing commas, proper quotes)
2. **Verify Python path** - Make sure the path to Python executable is correct
3. **Check working directory** - Ensure `cwd` points to the `backend` folder
4. **Test Python command manually**:
   ```bash
   cd backend
   venv\Scripts\python.exe -m app.mcp.server
   ```
   (Should start without errors - press Ctrl+C to stop)

### Module Not Found Errors

- **Set PYTHONPATH** in the `env` section to the backend directory
- **Ensure** you're using the Python from the virtual environment
- **Verify** all dependencies are installed: `pip install -r requirements.txt`

### Database Errors

- **Ensure** the database file exists or can be created
- **Check** DATABASE_URL in environment variables
- **Verify** file permissions for the backend directory

### API Key Errors

- **Add** your API keys to the `env` section in the config file
- **Or** ensure `.env` file exists in the backend directory with required keys

## Available MCP Tool

Once connected, Claude Desktop will have access to:

### `create_cbt_protocol`

Creates a CBT protocol using the multi-agent system.

**Parameters:**
- `intent` (required): Detailed description of the protocol intent, including clinical context, patient characteristics, and specific goals
- `protocol_type` (required): One of:
  - `exposure_hierarchy`
  - `thought_record`
  - `behavioral_activation`
  - `safety_planning`
  - `sleep_hygiene`
  - `custom`
- `user_id` (optional): User ID for the protocol. If not provided, a default system user will be used.

**Example Usage in Claude:**

```
Create a thought record protocol for a patient with depression. The intent is to help them identify and challenge negative automatic thoughts, particularly around self-worth and future expectations.
```

## Additional Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Claude Desktop MCP Guide](https://claude.ai/docs/mcp)


