"""
Document Converter API Server
Provides MuPDF-based PDF conversion and metadata extraction endpoints.
"""

import os
import tempfile
import logging
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_KEY = os.environ.get('DOCUMENT_CONVERTER_API_KEY', 'converter_secret_key')


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
    return jsonify({'status': 'healthy', 'service': 'document-converter'})


@app.route('/convert-mupdf', methods=['POST'])
@require_api_key
def convert_pdf_mupdf():
    """
    Convert PDF to Markdown using pymupdf4llm
    
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
        
        logger.info(f"Processing PDF with MuPDF: {file.filename}")
        
        import pymupdf4llm
        
        markdown_text = pymupdf4llm.to_markdown(input_path)
        
        # Clean up temp file
        os.unlink(input_path)
        
        logger.info(f"Successfully converted {file.filename} with MuPDF")
        
        return jsonify({
            'success': True,
            'markdown': markdown_text,
            'filename': file.filename
        })
        
    except Exception as e:
        logger.error(f"Error converting PDF with MuPDF: {str(e)}")
        # Clean up on error
        if 'input_path' in locals() and os.path.exists(input_path):
            os.unlink(input_path)
        return jsonify({'error': str(e)}), 500


@app.route('/extract-metadata', methods=['POST'])
@require_api_key
def extract_pdf_metadata():
    """
    Extract metadata from PDF using PyMuPDF
    
    Expects multipart/form-data with:
    - file: PDF file
    - fields (optional): JSON array of fields to extract
    
    Available fields: title, author, subject, keywords, creator, producer, 
                      creationDate, modDate, pageCount, format
    
    Returns:
    - metadata: Object with requested metadata fields
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400
    
    # Get requested fields (default to all)
    requested_fields = request.form.get('fields')
    if requested_fields:
        try:
            import json
            requested_fields = json.loads(requested_fields)
        except:
            requested_fields = None
    
    try:
        # Save uploaded file to temp location
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_input:
            file.save(tmp_input.name)
            input_path = tmp_input.name
        
        logger.info(f"Extracting metadata from PDF: {file.filename}")
        
        import fitz  # PyMuPDF
        
        doc = fitz.open(input_path)
        
        # Get all available metadata
        pdf_metadata = doc.metadata or {}
        
        all_metadata = {
            'title': pdf_metadata.get('title', ''),
            'author': pdf_metadata.get('author', ''),
            'subject': pdf_metadata.get('subject', ''),
            'keywords': pdf_metadata.get('keywords', ''),
            'creator': pdf_metadata.get('creator', ''),
            'producer': pdf_metadata.get('producer', ''),
            'creationDate': pdf_metadata.get('creationDate', ''),
            'modDate': pdf_metadata.get('modDate', ''),
            'pageCount': doc.page_count,
            'format': pdf_metadata.get('format', ''),
        }
        
        doc.close()
        
        # Filter to requested fields if specified
        if requested_fields and isinstance(requested_fields, list):
            metadata = {k: v for k, v in all_metadata.items() if k in requested_fields}
        else:
            metadata = all_metadata
        
        # Clean up temp file
        os.unlink(input_path)
        
        logger.info(f"Successfully extracted metadata from {file.filename}")
        
        return jsonify({
            'success': True,
            'metadata': metadata,
            'filename': file.filename
        })
        
    except Exception as e:
        logger.error(f"Error extracting PDF metadata: {str(e)}")
        # Clean up on error
        if 'input_path' in locals() and os.path.exists(input_path):
            os.unlink(input_path)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
