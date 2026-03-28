import matplotlib
matplotlib.use('Agg') # 強制使用 Agg 背景引擎，解決 Tkinter 在多執行緒下的崩潰問題
import mplfinance as mpf
import pandas as pd
import io
from typing import List, Dict

def generate_chart_image(data: List[Dict], width: int = 640, height: int = 640) -> io.BytesIO:
    """
    Generates a candlestick chart image from OHLC data for YOLO inference.
    
    Args:
        data: List of dictionaries containing 'time', 'open', 'high', 'low', 'close'.
              Time should be convertible to datetime.
        width: Image width in pixels (default 640 for YOLO).
        height: Image height in pixels (default 640).
        
    Returns:
        BytesIO object containing the JPEG image data.
    """
    if not data:
        return None

    # Convert to DataFrame
    df = pd.DataFrame(data)
    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)
    
    # Ensure columns are float
    for col in ['open', 'high', 'low', 'close']:
        df[col] = df[col].astype(float)

    # Style settings for high contrast (AI friendly)
    # We use a custom style: Black background, White candles (or simple Red/Green but high contrast)
    # Actually, standard red/green on black is fine, but removing grid/axes is crucial.
    
    mc = mpf.make_marketcolors(up='green', down='red', edge='i', wick='i', volume='in', inherit=True)
    s  = mpf.make_mpf_style(marketcolors=mc, gridstyle='', facecolor='black', edgecolor='white')

    # Create buffer
    buf = io.BytesIO()

    # Plot
    # type='candle', style=s, no_xgaps=True
    # axisoff=True is key to remove labels and borders
    fig, axlist = mpf.plot(
        df,
        type='candle',
        style=s,
        figsize=(width/100, height/100),
        axisoff=True,
        returnfig=True,
        closefig=True,
        volume=False,
        scale_padding=dict(left=0.1, right=0.1, top=0.1, bottom=0.1),
    )
    
    # Save to buffer
    fig.savefig(buf, format='jpg', dpi=100, bbox_inches='tight', pad_inches=0, facecolor='black')
    buf.seek(0)
    
    return buf
