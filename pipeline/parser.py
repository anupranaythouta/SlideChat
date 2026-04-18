from pathlib import Path


def parse_pdf(file_path: str) -> list[dict]:
    import pdfplumber

    slides = []
    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            slides.append({"slide_number": i, "text": text.strip()})
    return slides


def parse_pptx(file_path: str) -> list[dict]:
    from pptx import Presentation

    prs = Presentation(file_path)
    slides = []
    for i, slide in enumerate(prs.slides, start=1):
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = " ".join(run.text for run in para.runs).strip()
                    if line:
                        parts.append(line)
        slides.append({"slide_number": i, "text": "\n".join(parts)})
    return slides


def parse_file(file_path: str) -> list[dict]:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(file_path)
    elif suffix in (".pptx", ".ppt"):
        return parse_pptx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")
