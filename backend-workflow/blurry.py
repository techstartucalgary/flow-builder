import cv2
import numpy as np

def is_blurry(img_path):
    img = cv2.imread(img_path)
    if img is None:
        return False
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    cv2.imshow("img", img)
    cv2.imshow("gray", gray)
    cv2.imshow("laplacian", laplacian)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    score = laplacian.var()
    return score < 100

def check_contrast_brightness(img_path, min_contrast=40.0, min_brightness=30.0, max_brightness=230.0):
    img = cv2.imread(img_path)
    if img is None:
        return {
            'has_sufficient_contrast': False,
            'has_good_brightness': False,
            'contrast_score': 0.0,
            'brightness_score': 0.0,
            'is_acceptable': False
        }
    
    # Convert to grayscale for analysis
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Calculate contrast (standard deviation of pixel intensities)
    # Higher std dev = more contrast between different regions
    contrast_score = float(gray.std())
    has_sufficient_contrast = contrast_score >= min_contrast
    
    # Calculate brightness (mean pixel intensity)
    # Values range from 0 (black) to 255 (white)
    brightness_score = float(gray.mean())
    has_good_brightness = min_brightness <= brightness_score <= max_brightness
    
    is_acceptable = has_sufficient_contrast and has_good_brightness
    
    return {
        'has_sufficient_contrast': has_sufficient_contrast,
        'has_good_brightness': has_good_brightness,
        'contrast_score': contrast_score,
        'brightness_score': brightness_score,
        'is_acceptable': is_acceptable
    }

def check_aspect_ratio(img_path, min_ratio=0.7, max_ratio=1.4):
    img = cv2.imread(img_path)
    if img is None:
        return {
            'has_valid_aspect_ratio': False,
            'aspect_ratio': 0.0,
            'width': 0,
            'height': 0,
            'ratio_description': 'invalid'
        }
    
    height, width = img.shape[:2]
    
    # Calculate min(width, height) / max(width, height)
    # This gives a value between 0 and 1, where 1 means square
    min_dim = min(width, height)
    max_dim = max(width, height)
    aspect_ratio = float(min_dim) / float(max_dim)
    
    # Check if ratio is within valid range: 0.7 ≤ ratio ≤ 1.4
    # Note: Since min/max ratio is always ≤ 1.0, the effective range is 0.7 to 1.0
    has_valid_aspect_ratio = min_ratio <= aspect_ratio <= max_ratio
    
    # Calculate traditional width:height ratio for description
    width_height_ratio = float(width) / float(height)
    
    # Create a readable description of the ratio
    if 0.95 <= width_height_ratio <= 1.05:
        ratio_description = "1:1 (square)"
    elif width_height_ratio < 1.0:
        # Portrait orientation (height > width)
        simplified_ratio = f"1:{1/width_height_ratio:.2f}"
        ratio_description = f"{simplified_ratio} (portrait)"
    else:
        # Landscape orientation (width > height)
        simplified_ratio = f"{width_height_ratio:.2f}:1"
        ratio_description = f"{simplified_ratio} (landscape)"
    
    return {
        'has_valid_aspect_ratio': has_valid_aspect_ratio,
        'aspect_ratio': aspect_ratio,  # This is min/max ratio
        'width_height_ratio': width_height_ratio,  # Traditional width:height ratio
        'width': width,
        'height': height,
        'ratio_description': ratio_description
    }

if __name__ == "__main__":
    img_path = "test5.png"  # Relative path for cross-platform compatibility
    
    # Blurriness check
    blurry = is_blurry(img_path)
    print("blurry" if blurry else "not blurry")
    
    # Contrast/Brightness check
    result = check_contrast_brightness(img_path)
    print("bright/contrasted enough" if result['is_acceptable'] else "not bright/contrasted enough")
    
    # Aspect Ratio check
    aspect_result = check_aspect_ratio(img_path)
    print("valid aspect ratio" if aspect_result['has_valid_aspect_ratio'] else "invalid aspect ratio")