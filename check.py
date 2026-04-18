import sys

with open('index.html', 'r', encoding='utf-8', errors='surrogateescape') as f:
    content = f.read()

print("let apiKey... in context:", 'let apiKey = localStorage.getItem' in content)
print("function analyzeBatch in context:", 'function analyzeBatch' in content)
print("block_start in context:", '        let allSheetsData = \'\';' in content)
print("block_end in context:", "document.getElementById('fileName').style.display = 'none';\n        document.getElementById('fileUpload').value = '';\n\n      } catch (e) {" in content)
