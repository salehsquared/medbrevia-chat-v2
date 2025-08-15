import os
from PIL import Image

def list_files_and_image_dimensions(directory_path):
    """
    Prints the file structure of a directory and the dimensions of any image files found,
    skipping .next and node_modules directories.
    """
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'}

    for root, dirs, files in os.walk(directory_path):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if d not in {'.next', 'node_modules', '.git', '.idea'}]

        level = root.replace(directory_path, '').count(os.sep)
        indent = ' ' * 4 * level
        print(f'{indent}{os.path.basename(root)}/')

        sub_indent = ' ' * 4 * (level + 1)
        for f in files:
            file_ext = os.path.splitext(f)[1].lower()
            if file_ext in image_extensions:
                try:
                    image_path = os.path.join(root, f)
                    with Image.open(image_path) as img:
                        width, height = img.size
                        print(f'{sub_indent}{f} (Image, {width}x{height})')
                except Exception as e:
                    print(f'{sub_indent}{f} (Could not read image dimensions: {e})')
            else:
                print(f'{sub_indent}{f}')

if __name__ == "__main__":
    folder_path = '/Users/saleh/WebstormProjects/medbrevia-chat-v2'

    if os.path.isdir(folder_path):
        list_files_and_image_dimensions(folder_path)
    else:
        print("Error: The provided path is not a valid directory.")