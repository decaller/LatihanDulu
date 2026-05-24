import os
import sqlite3
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from prefect import flow, task, get_run_logger
import ollama
from dotenv import load_dotenv
import time

# Bismillah. Optimized Generator with Enhanced Ensemble and Prompt Stability.

# Load .env dynamically
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
env_path = os.path.join(project_root, ".env")
load_dotenv(dotenv_path=env_path, override=False)

# Pydantic model for structured output
class QuizQuestion(BaseModel):
    question_text: str = Field(..., description="The multiple choice question text based on the article")
    option_a: str = Field(..., description="Option A")
    option_b: str = Field(..., description="Option B")
    option_c: str = Field(..., description="Option C")
    option_d: str = Field(..., description="Option D")
    correct_option: str = Field(..., description="The correct option letter (A, B, C, or D)")
    explanation: str = Field(..., description="Brief explanation why the option is correct")
    reference_snippet: str = Field(..., description="The exact verbatim text from the article content that supports the answer")

class QuizSet(BaseModel):
    questions: List[QuizQuestion]

@task
def get_articles_to_process(limit: int = 5) -> List[dict]:
    db_path = os.getenv("DB_PATH", "backend/data.db")
    if not os.path.isabs(db_path):
        db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get articles that don't have questions yet
    cursor.execute("SELECT a.id, a.title, a.silsilah, a.speaker, a.content FROM articles a LEFT JOIN questions q ON a.id = q.article_id WHERE q.id IS NULL AND a.content != '' ORDER BY a.id DESC LIMIT ?", (limit,))
    
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return articles

@task
def summarize_article_task(content: str) -> str:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    model = "aya:latest"
    
    # Limit context for summary
    truncated_content = content[:4000]
    
    try:
        logger.info(f"Summarizing article with {model}...")
        response = client.generate(
            model=model, 
            prompt=f"Ringkaslah isi teks berikut dalam Bahasa Indonesia yang baku, padat, dan mencakup poin-poan utama:\n\n{truncated_content}"
        )
        return response['response'].strip()
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        return "Ringkasan tidak tersedia."

@task
def generate_questions_task(article: dict, summary: str, chunk: str, model_name: str) -> List[QuizQuestion]:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    
    metadata = f"Title: {article['title']}\nSilsilah: {article.get('silsilah', '')}"
    
    # Strict prompt optimized for JSON reliability
    prompt = f"""
    [SYSTEM: ONLY OUTPUT VALID JSON. NO CHITCHAT. NO PREAMBLE.]
    Bismillah. Anda adalah Ustadz dari Univ. Madinah. Buat 3-5 soal MCQ dari 'POTONGAN TEKS' di bawah.
    
    ATURAN:
    1. Kesulitan bertahap (Fakta -> Konsep -> Analisis).
    2. Wajib angkat istilah khusus/analogi/dalil dari teks jika ada.
    3. Jawaban harus komprehensif, sesuai teks, tanpa halusinasi.
    4. Bahasa Indonesia baku dan profesional.
    5. Output harus berupa JSON object dengan key "questions".
    
    KONTEKS: {metadata}
    RINGKASAN ARTIKEL: {summary}
    POTONGAN TEKS: {chunk}
    
    JSON FORMAT:
    {{
        "questions": [
            {{
                "question_text": "...",
                "option_a": "...",
                "option_b": "...",
                "option_c": "...",
                "option_d": "...",
                "correct_option": "A/B/C/D",
                "explanation": "...",
                "reference_snippet": "Kutipan persis dari teks"
            }}
        ]
    }}
    """
    
    try:
        logger.info(f"Generating questions with {model_name}...")
        response = client.generate(
            model=model_name,
            prompt=prompt,
            format='json',
            options={'temperature': 0.1} # Low temp for high stability
        )
        quiz_set = QuizSet.model_validate_json(response['response'])
        return quiz_set.questions
    except Exception as e:
        logger.error(f"Generation error with {model_name}: {e}")
        return []

@task
def save_questions_task(article_id: int, questions: List[QuizQuestion], model_name: str):
    if not questions:
        return
        
    db_path = os.getenv("DB_PATH", "backend/data.db")
    if not os.path.isabs(db_path):
        db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    sql = "INSERT INTO questions (article_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, reference_snippet, created_by_model, created_on_device, checked_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    
    for q in questions:
        cursor.execute(sql, (
            article_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, 
            q.correct_option.upper(), q.explanation, q.reference_snippet,
            model_name, "Server-Prod-Ensemble", "buatan AI"
        ))
    
    conn.commit()
    conn.close()

@flow(name="Quiz Generator Ensemble - Qwen High Quality")
def quiz_generator_ensemble_flow(limit: int = 1500):
    logger = get_run_logger()
    articles = get_articles_to_process(limit)
    
    if not articles:
        logger.info("No articles found to process.")
        return
        
    # Winner Ensemble: 9B (Speed/Quality), 7B (Reliable Fallback), 32B (Heavyweight Backup)
    p_model = "qwen3.5:9b"
    f_model = "qwen2.5:7b"
    b_model = "qwen2.5:32b"
    
    for article in articles:
        logger.info(f"🚀 Processing article: {article['title']}")
        summary = summarize_article_task(article['content'])
        
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', article['content']) if p.strip()]
        chunks = []
        current_chunk = ""
        for p in paragraphs:
            current_chunk += p + "\n\n"
            if len(current_chunk) >= 1500:
                chunks.append(current_chunk.strip())
                current_chunk = ""
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        for chunk in chunks[:5]:
            # Try Primary Model (9B)
            questions = generate_questions_task(article, summary, chunk, p_model)
            
            if not questions:
                # Try Fast Fallback (7B)
                logger.info(f"⚠️ Primary {p_model} failed, trying Fast Fallback {f_model}...")
                questions = generate_questions_task(article, summary, chunk, f_model)
            
            if not questions:
                # Try Heavyweight Backup (32B)
                logger.info(f"🚨 Both failed, calling Heavyweight Scholar {b_model}...")
                questions = generate_questions_task(article, summary, chunk, b_model)
            
            if questions:
                save_questions_task(article['id'], questions, "Ensemble-Mixed")
                logger.info(f"✅ Saved {len(questions)} questions.")

if __name__ == "__main__":
    quiz_generator_ensemble_flow(limit=1500)
