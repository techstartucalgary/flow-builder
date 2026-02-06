import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.utils import load_img, img_to_array
import numpy as np
import sys
from pathlib import Path

# Get the directory where the model is located
script_dir = Path(__file__).parent
model_path = script_dir / 'binary_image_classifier_model.keras'
model = keras.models.load_model(str(model_path))

# Get image path from command line
img_path = sys.argv[1]

# Load image and convert to array
img = load_img(img_path, target_size=(180, 180))
img_array = img_to_array(img)
img_array = np.expand_dims(img_array, axis=0)

# Make prediction
prediction = model.predict(img_array, verbose=0)
score = prediction[0][0]

# Display results
print(f"\nImage: {Path(img_path).name}")
print(f"Raw prediction score: {score:.4f}")
print(f"Threshold: 0.5\n")
if score > 0.5:
    print("[+] FLOOR PLAN DETECTED")
    print(f"Confidence: {score:.2%}")
else:
    print("[-] NOT A FLOOR PLAN")
    print(f"Confidence: {(1-score):.2%}")
