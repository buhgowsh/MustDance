import yt_dlp
from yt_dlp.utils import download_range_func

yt_opts = {
    'verbose': True,
    'force_keyframes_at_cuts': True,
}

video = "https://youtu.be/Gs069dndIYk?si=FS81OW9kYcHWrd_Z"

with yt_dlp.YoutubeDL(yt_opts) as ydl:
    ydl.download(video)