"""
Marker API Server
Wraps datalab-to/marker with an HTTP endpoint protected by X-API-Key
"""

import os
import tempfile
import logging
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_KEY = os.environ.get('MARKER_API_KEY', 'marker_secret_key')


def require_api_key(f):
    """Decorator to require X-API-Key header"""
    @wraps(f)
    def decorated(*args, **kwargs):
        provided_key = request.headers.get('X-API-Key')
        if not provided_key or provided_key != API_KEY:
            return jsonify({'error': 'Invalid or missing API key'}), 401
        return f(*args, **kwargs)
    return decorated


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'marker-api'})


@app.route('/convert', methods=['POST'])
@require_api_key
def convert_pdf():
    """
    Convert PDF to Markdown
    
    Expects multipart/form-data with:
    - file: PDF file
    
    Returns:
    - markdown: The converted markdown text
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400
    
    try:
        # Save uploaded file to temp location
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_input:
            file.save(tmp_input.name)
            input_path = tmp_input.name
        
        logger.info(f"Processing PDF: {file.filename}")
        
        # Use marker to convert PDF to markdown
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered
        
        # Create models (this caches after first call)
        models = create_model_dict()
        
        # Convert PDF
        converter = PdfConverter(artifact_dict=models)
        rendered = converter(input_path)
        markdown_text, _, _ = text_from_rendered(rendered)
        
        # Clean up temp file
        os.unlink(input_path)
        
        logger.info(f"Successfully converted {file.filename}")
        
        return jsonify({
            'success': True,
            'markdown': markdown_text,
            'filename': file.filename
        })
        
    except Exception as e:
        logger.error(f"Error converting PDF: {str(e)}")
        # Clean up on error
        if 'input_path' in locals() and os.path.exists(input_path):
            os.unlink(input_path)
        return jsonify({'error': str(e)}), 500


@app.route('/convert-path', methods=['POST'])
@require_api_key
def convert_pdf_from_path():
    """
    Convert PDF to Markdown from a file path
    
    Expects JSON with:
    - path: Path to the PDF file on the shared volume
    
    Returns:
    - markdown: The converted markdown text
    """
    data = request.get_json()
    if not data or 'path' not in data:
        return jsonify({'error': 'No path provided'}), 400
    
    file_path = data['path']
    
    if not os.path.exists(file_path):
        return jsonify({'error': f'File not found: {file_path}'}), 404
    
    if not file_path.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400
    
    try:
        logger.info(f"Processing PDF from path: {file_path}")
        
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered
        
        models = create_model_dict()
        converter = PdfConverter(artifact_dict=models)
        rendered = converter(file_path)
        markdown_text, _, _ = text_from_rendered(rendered)
        
        logger.info(f"Successfully converted {file_path}")
        
        return jsonify({
            'success': True,
            'markdown': markdown_text,
            'path': file_path
        })
        
    except Exception as e:
        logger.error(f"Error converting PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
