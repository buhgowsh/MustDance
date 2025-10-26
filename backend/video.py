import yt_dlp
from yt_dlp.utils import download_range_func

# Define the start and end times in HH:MM:SS format
start_time = 14  # 30 seconds
end_time = 48    # 1 minute and 45 seconds

yt_opts = {
    'verbose': True,
    'force_keyframes_at_cuts': True,
    'outtmpl': "test",
    'download_ranges': download_range_func(None, [(start_time, end_time)]),
}

video = "https://youtube.com/watch?v=fCv5q2yoqAY"

with yt_dlp.YoutubeDL(yt_opts) as ydl:
    ydl.download(video)