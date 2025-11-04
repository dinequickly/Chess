from __future__ import annotations

import modal
import json
from io import BytesIO

app = modal.App("podcast-video-generator")

image = (
    modal.Image.debian_slim()
    .pip_install(
        "pillow>=10.0.0",
        "moviepy==1.0.3",
        "httpx==0.27.0"
        "fastapi[standard]"
    )
    .apt_install("ffmpeg")
)

@app.function(
    secrets=[modal.Secret.from_name("unsplash-key")],
    timeout=1800,
    image=image
)
@modal.fastapi_endpoint(method="POST")  # Changed from web_endpoint
def generate_video(data: dict):
    """
    Receives: slides (JSON array) + audio_url
    Returns: video as base64
    """
    import os
    import httpx
    from PIL import Image, ImageDraw, ImageFont
    from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips
    import base64
    import textwrap
    
    print("Starting video generation")
    
    try:
        slides = data.get('slides', [])
        audio_url = data.get('audio_url')
        
        if not slides or not audio_url:
            return {'success': False, 'error': 'slides and audio_url required'}
        
        print(f"Processing {len(slides)} slides")
        
        # Download audio
        print("Downloading audio...")
        audio_response = httpx.get(audio_url)
        audio_path = "/tmp/podcast_audio.mp3"
        with open(audio_path, "wb") as f:
            f.write(audio_response.content)
        
        audio_clip = AudioFileClip(audio_path)
        total_audio_duration = audio_clip.duration
        
        # Generate slide images
        print("Generating slide images...")
        slide_paths = []
        
        for i, slide in enumerate(slides):
            print(f"Creating slide {i+1}/{len(slides)}")
            
            bg_image = fetch_background_image(slide.get('image_search', 'abstract background'), os.environ.get('UNSPLASH_ACCESS_KEY'))
            slide_img = render_slide(slide, bg_image)
            
            slide_path = f"/tmp/slide_{i+1}.png"
            slide_img.save(slide_path)
            slide_paths.append((slide_path, slide.get('duration_seconds', 10)))
        
        # Adjust durations
        print("Assembling video...")
        total_slide_duration = sum(d for _, d in slide_paths)
        duration_multiplier = total_audio_duration / total_slide_duration
        
        clips = []
        current_time = 0
        
        for slide_path, base_duration in slide_paths:
            adjusted_duration = base_duration * duration_multiplier
            
            slide_clip = (
                ImageClip(slide_path)
                .set_duration(adjusted_duration)
                .set_start(current_time)
            )
            clips.append(slide_clip)
            current_time += adjusted_duration
        
        # Render
        video = concatenate_videoclips(clips, method="compose")
        final_video = video.set_audio(audio_clip)
        
        output_path = "/tmp/podcast_video.mp4"
        final_video.write_videofile(
            output_path,
            fps=24,
            codec='libx264',
            audio_codec='aac',
            temp_audiofile='/tmp/temp-audio.m4a',
            remove_temp=True
        )
        
        print("Video rendered successfully")
        
        # Return as base64
        with open(output_path, 'rb') as f:
            video_bytes = f.read()
        
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')
        
        return {
            'success': True,
            'video_base64': video_base64,
            'size_bytes': len(video_bytes),
            'duration_seconds': total_audio_duration
        }
        
    except Exception as e:
        import traceback
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }


def fetch_background_image(search_query: str, api_key: str):
    """Fetch background image from Unsplash"""
    import httpx
    from PIL import Image
    
    try:
        response = httpx.get(
            "https://api.unsplash.com/search/photos",
            params={
                "query": search_query,
                "orientation": "landscape",
                "per_page": 1
            },
            headers={"Authorization": f"Client-ID {api_key}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('results'):
                img_url = data['results'][0]['urls']['regular']
                img_response = httpx.get(img_url, timeout=10)
                return Image.open(BytesIO(img_response.content)).resize((1920, 1080))
    except Exception as e:
        print(f"Unsplash error: {e}")
    
    # Fallback
    from PIL import Image
    return Image.new('RGB', (1920, 1080), (44, 62, 80))


def render_slide(slide: dict, background):
    """Render slide with text overlay"""
    from PIL import Image, ImageDraw, ImageFont
    import textwrap
    
    img = background.copy()
    
    # Dark overlay
    overlay = Image.new('RGBA', (1920, 1080), (0, 0, 0, 150))
    img.paste(overlay, (0, 0), overlay)
    
    draw = ImageDraw.Draw(img)
    
    # Fonts
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 80)
        text_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 50)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
    except:
        title_font = ImageFont.load_default()
        text_font = ImageFont.load_default()
        small_font = ImageFont.load_default()
    
    slide_type = slide.get('slide_type', 'bullets')
    
    if slide_type == 'title':
        title = slide.get('title', '')
        bbox = draw.textbbox((0, 0), title, font=title_font)
        title_width = bbox[2] - bbox[0]
        draw.text(
            ((1920 - title_width) // 2, 400),
            title,
            fill='white',
            font=title_font
        )
        
        if slide.get('subtitle'):
            subtitle = slide['subtitle']
            bbox = draw.textbbox((0, 0), subtitle, font=text_font)
            subtitle_width = bbox[2] - bbox[0]
            draw.text(
                ((1920 - subtitle_width) // 2, 550),
                subtitle,
                fill='#ECF0F1',
                font=text_font
            )
    
    elif slide_type == 'bullets':
        y_position = 200
        draw.text((100, y_position), slide.get('title', ''), fill='white', font=title_font)
        y_position += 150
        
        for point in slide.get('content', []):
            wrapped = textwrap.fill(point, width=60)
            draw.text((150, y_position), f"• {wrapped}", fill='#ECF0F1', font=text_font)
            y_position += 100
    
    elif slide_type == 'quote':
        quote_text = f'"{slide.get("content", "")}"'
        wrapped = textwrap.fill(quote_text, width=40)
        lines = wrapped.split('\n')
        
        y_start = 400
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=text_font)
            line_width = bbox[2] - bbox[0]
            draw.text(
                ((1920 - line_width) // 2, y_start),
                line,
                fill='white',
                font=text_font
            )
            y_start += 80
    
    else:
        draw.text((100, 200), slide.get('title', ''), fill='white', font=title_font)
        
        if slide.get('content'):
            content = slide['content'] if isinstance(slide['content'], str) else slide['content'][0]
            wrapped = textwrap.fill(content, width=80)
            draw.text((100, 900), wrapped, fill='#ECF0F1', font=small_font)
    
    return img