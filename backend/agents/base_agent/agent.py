import os
from google.adk.agents import Agent
from google.adk.agents import SequentialAgent
from google.adk.tools.agent_tool import AgentTool
from dotenv import load_dotenv
import yt_dlp
from yt_dlp.utils import download_range_func
from youtube_search import YoutubeSearch
from typing import cast, Any, Dict

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY or "MISSING_API_KEY"

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"


def video_search(query: str) -> str:
    """
    Searches youtube for a video matching the given query.

    Args:
        query (str): the given information to search youtube for

    Returns:
        str: either a valid youtube url or an empty string.
    """

    videoURL = "https://youtube.com/watch?v="

    results = YoutubeSearch(str({query}), max_results=1).to_dict()

    thingy = cast(Dict[str, Any], results[0])

    # Check to make sure the search returned a youtube video id
    try:
        videoURL += str(thingy['id'])
    except TypeError as e:
        videoURL = ""

    return videoURL

# agent to pull up a video of the dance desired
video_search_agent = Agent(
    name = "VideoSearchAgent",
    model = "gemini-2.0-flash",
    description = "Searches for information about requested dances.",
    instruction = """You are a helpful researcher.
        Utilize **video_search** to find a **publicly accessible YouTube video URL** related to the dance requested by the user.
        Your search query should be highly specific, including the dance name and the phrase 'full youtube video'.
        If a valid URL (e.g., https://www.youtube.com/watch?v=...) is found, **return ONLY that URL string**.
        If the search returns an error, or if you cannot find a direct YouTube URL, return an empty string.""",
    tools = [video_search],
)


video_process_agent = Agent(
    name = "VideoProcessAgent",
    model = "gemini-2.5-flash",
    description = "Analyses given YouTube URL and returns the time that dancing starts, as well as the time that dancing ends.",
    instruction = """You are an expert video analyzer.

    ** Task **
    Your task is to use the given YouTube URL, which contains a video of a dance, to find two points:
    1. The point at which the dancing begins, as an integer.
    2. The point at which the dancing ends, as an integer.

    ** Output ** 
    "Return these two values along with the URL in a list in the following format: [URL, start_point, end_point].""",
)

# custom tool to execute yt-dlp
def video_download(url: str, start: int, end: int):
    """
    Runs a function to download a video within a given timeframe.

    Args:
        url (str): the URL of the video that will be downloaded
        start (int): the beginning of the timeframe of said video that will be downloaded.
        end (int): the end of the timeframe of said video that will be downloaded.
    """
    yt_opts = {
        'verbose': True,
        'force_keyframes_at_cuts': True,
        'outtmpl': "test",
        'merge_output_format': "mp4",
        'download_ranges': download_range_func(None, [(start, end)]),
    }

    video = {url}

    with yt_dlp.YoutubeDL(yt_opts) as ydl:
        ydl.download(video)

video_download_agent = Agent(
    name = "VideoDownloadAgent",
    model = "gemini-2.5-flash",
    description = "Call video_download function using the given list.",
    instruction = """You are an expert function caller.
    
    ** Task **
    Your task is to use the list provided to you in the format of [url, start_point, end_point] to call the video_download tool.
    An example call to the tool looks like: video_download(url, start_point, end_point)
    
    ** Output **
    Return either 'Success' if the tool executed without error, or 'Failure' if an error was enountered.""",
    tools = [video_download]
)


video_pipeline_agent = SequentialAgent(
    name = "VideoPipelineAgent",
    sub_agents = [video_search_agent, video_process_agent, video_download_agent],
    description = "Executes a series of video searching, analyzing, and downloading.",
)

root_agent = video_pipeline_agent