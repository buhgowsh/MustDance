import os
import asyncio
from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm # For multi-model support
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.adk.tools import google_search
from google.genai import types # For creating message Content/Parts

os.environ["GOOGLE_API_KEY"] = "YOUR_GOOGLE_API_KEY"

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"

# agent to pull up a video of the dance desired
searchAgent = Agent(
    name = "dance_search_agent",
    model = "gemini-2.0-flash",
    description = "Searches for information about requested dances.",
    instruction = "You are a helpful researcher. "
                  "utilize google_search to find videos related to the dance requested by the user. "
                  "If the search returns an error, inform the user politely. "
                  "If the search is successful, prioritize returning a url to a YouTube video.",
    tools = [google_search],
)



# we also want an agent to analyze the comparison in ddr accuracy style (LlmAgent)
    # providing feedback on improvement if needed

# curious about speech recognition to allow for searching for dances
    # stretch goal: search for dances and music to dance to separately