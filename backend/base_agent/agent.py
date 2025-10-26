import os
import asyncio
from google.adk.agents import Agent
from google.adk.agents import SequentialAgent
# from google.adk.models.lite_llm import LiteLlm # For multi-model support
# from google.adk.sessions import InMemorySessionService
# from google.adk.runners import Runner
from google.adk.tools import google_search
# from google.genai import types # For creating message Content/Parts
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY or "MISSING_API_KEY"

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"

# agent to pull up a video of the dance desired
video_search_agent = Agent(
    name = "VideoSearchAgent",
    model = "gemini-2.0-flash",
    description = "Searches for information about requested dances.",
    instruction = "You are a helpful researcher that will provide one of two things and nothing else. "
                  "Utilize google_search to find a video related to the dance requested by the user. "
                  "If the search returns an error, return an empty string. "
                  "If the search is successful, return ONLY a url to a YouTube video. "
                  "Ensure the link provided to the user maps to a video publicly accessible on YoutTube.",
    tools = [google_search],
)


video_process_agent = Agent(
    name = "VideoProcessAgent",
    model = "gemini-2.5-flash",
    description = "Analyses given YouTube URL and returns the time that dancing starts, as well as the time that dancing ends.",
    instruction = """You are an expert video analyzer.

    ** Task **
    Your task is to use the given YouTube URL, which contains a video of a dance, to find two points:
    1. The point at which the dancing begins, in HH:MM:SS format.
    2. The point at which the dancing ends, in HH:MM:SS format.

    ** Output ** 
    "Return these two values in a list in the following format: [start_point, end_point].""",
)

# custom tool to execute yt-dlp


video_pipeline_agent = SequentialAgent(
    name = "VideoPipelineAgent",
    sub_agents = [video_search_agent, video_process_agent],
    description = "",
)

root_agent = video_pipeline_agent



# we also want an agent to analyze the comparison in ddr accuracy style (LlmAgent)
    # providing feedback on improvement if needed

# curious about speech recognition to allow for searching for dances
    # stretch goal: search for dances and music to dance to separately