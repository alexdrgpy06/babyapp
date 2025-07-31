import os
import sys

# List of file extensions to scan
EXTENSIONS = [
    '.js', '.html', '.css', '.json', '.py', '.md', '.txt'
]

def should_scan(file):
    return any(file.endswith(ext) for ext in EXTENSIONS)

def scan_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for lineno, line in enumerate(f, start=1):
            if 'TODO' in line:
                print(f"{path}:{lineno}: TODO found")
                return False
    return True

def main(root='.'):  # root path
    success = True
    for dirpath, dirnames, filenames in os.walk(root):
        # skip .git directory
        if '.git' in dirnames:
            dirnames.remove('.git')
        for name in filenames:
            if should_scan(name):
                path = os.path.join(dirpath, name)
                # skip this script itself
                if os.path.abspath(path) == os.path.abspath(__file__):
                    continue
                if not scan_file(path):
                    success = False
    if not success:
        print("TODOs found")
        sys.exit(1)
    print("No TODOs found")

if __name__ == '__main__':
    main()
