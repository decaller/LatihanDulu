import os
import sqlite3
import json
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from prefect import flow, task, get_run_logger
import ollama
from dotenv import load_dotenv
import time
from datetime import datetime

# Bismillah. Advanced Benchmark Redesign.

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
def get_advanced_articles(limit: int = 2) -> List[dict]:
    db_path = os.getenv("DB_PATH", "backend/data.db")
    if not os.path.isabs(db_path):
        db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Priority for long articles (presumably more 'advanced')
    cursor.execute("""
        SELECT a.id, a.title, a.silsilah, a.speaker, a.content 
        FROM articles a
        LEFT JOIN questions q ON a.id = q.article_id
        WHERE q.id IS NULL AND a.content != ''
        ORDER BY LENGTH(a.content) DESC
        LIMIT ?
    """, (limit,))
    
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return articles

@task
def summarize_with_mt5(article_content: str) -> str:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    model_name = "hf.co/ar08/mT5_multilingual_XLSum-Q4_K_M-GGUF:Q4_K_M"
    
    logger.info(f"Summarizing article using {model_name}...")
    
    # mT5 XLSum prompt format (simple instruction or direct input depending on GGUF tuning)
    prompt = f"Summarize the following text in Indonesian:\n\n{article_content[:4000]}"
    
    try:
        response = client.generate(model=model_name, prompt=prompt)
        summary = response['response'].strip()
        logger.info("Summary completed.")
        return summary
    except Exception as e:
        logger.error(f"mT5 Summarization failed: {str(e)}")
        return "Summary unavailable (Error)"

@task
def generate_questions_advanced_task(article: dict, summary: str, model_name: str) -> Tuple[bool, float, str, List[QuizQuestion]]:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    
    # Chunking: Based on paragraph with minimal characters (e.g., 500 chars minimum per chunk)
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', article['content']) if p.strip()]
    
    # Combine small paragraphs to meet minimal character threshold
    min_chars = 1000
    chunks = []
    current_chunk = ""
    for p in paragraphs:
        current_chunk += p + "\n\n"
        if len(current_chunk) >= min_chars:
            chunks.append(current_chunk.strip())
            current_chunk = ""
    if current_chunk: # Add remaining
        chunks.append(current_chunk.strip())
    
    # For benchmark, we take the FIRST significant chunk
    text_chunk = chunks[0] if chunks else article['content'][:2000]
    
    metadata = f"Title: {article['title']}\nSilsilah: {article.get('silsilah', '')}\nSpeaker: {article.get('speaker', '')}"
    
    prompt = f"""
    Bismillah. You are a noble and scholarly Islamic teacher (Ustadz) who strictly adheres to the Manhaj Salaf (the methodology of the righteous predecessors).
    You possess deep knowledge of Islamic sciences, absolute precision in teaching, and you strictly rely on authentic, verified evidence from the provided text.
    
    ### CONTEXT:
    Metadata: {metadata}
    
    ### SUMMARY OF FULL ARTICLE:
    {summary}
    
    ### POTONGAN TEKS (Target Context):
    {text_chunk}
    
    ### INSTRUKSI PEMBUATAN Q&A:
    1. Buatlah 3 hingga 5 pertanyaan dengan tingkat kesulitan yang bertahap (mulai dari pertanyaan faktual dasar, pemahaman konsep, hingga analisis kritis atau kesimpulan).
    2. Jika terdapat istilah khusus, perumpamaan (analogi), atau kutipan dalil/aturan penting di dalam Potongan Teks, pastikan hal tersebut diangkat menjadi salah satu pertanyaan.
    3. Jawaban harus komprehensif, terstruktur, dan tidak berhalusinasi (tidak menambahkan informasi dari luar teks yang tidak relevan).
    4. Gunakan bahasa Indonesia yang baku, profesional, dan mudah dipahami oleh peserta didik.
    
    Return the result in JSON format:
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
                "reference_snippet": "EXACT verbatim text from 'Potongan Teks' above"
            }}
        ]
    }}
    """
    
    start_time = time.time()
    try:
        response = client.chat(
            model=model_name,
            messages=[{'role': 'user', 'content': prompt}],
            format='json'
        )
        elapsed = time.time() - start_time
        quiz_set = QuizSet.model_validate_json(response['message']['content'])
        return True, elapsed, "", quiz_set.questions
    except Exception as e:
        elapsed = time.time() - start_time
        return False, elapsed, str(e), []

@task
def save_advanced_questions(article_id: int, questions: List[QuizQuestion], model_name: str):
    if not questions: return
    db_path = os.getenv("DB_PATH", "backend/data.db")
    if not os.path.isabs(db_path): db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    for q in questions:
        cursor.execute(\"\"\"
            INSERT INTO questions (article_id, question_text, option_a, option_b, option_c, option_d, 
            correct_option, explanation, reference_snippet, created_by_model, created_on_device, checked_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \"\"\", (article_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, 
                 q.correct_option.upper(), q.explanation, q.reference_snippet, model_name, "Server-Prod-Benchmark", "buatan AI"))
    conn.commit()
    conn.close()

@flow(name="Advanced Qwen Benchmark")
def advanced_benchmark_flow(models: List[str], article_count: int = 2):
    logger = get_run_logger()
    logger.info(f"Starting advanced benchmark for models: {models}")
    
    articles = get_advanced_articles(article_count)
    if not articles:
        logger.error("No articles found to benchmark.")
        return

    results = {}
    
    for model in models:
        logger.info(f"== Testing Model: {model} ==")
        model_stats = {"success": 0, "total_time": 0, "errors": []}
        
        for article in articles:
            # 1. Summarize with mT5 (only once per article could be optimized, but here we do it per test flow)
            summary = summarize_with_mt5(article['content'])
            
            # 2. Generate questions
            success, elapsed, error, questions = generate_questions_advanced_task(article, summary, model)
            model_stats["total_time"] += elapsed
            
            if success:
                model_stats["success"] += 1
                save_advanced_questions(article['id'], questions, model)
                logger.info(f"Success! {len(questions)} questions saved for article {article['id']}.")
            else:
                model_stats["errors"].append(error)
                logger.error(f"Failed for article {article['id']}: {error}")
        
        results[model] = {
            "success_rate": f"{(model_stats['success'] / len(articles)) * 100:.0f}%",
            "avg_time": f"{model_stats['total_time'] / len(articles):.2f}s",
            "failed_count": len(model_stats["errors"])
        }

    # Generate Report
    report_path = "advanced_benchmark_report.md"
    with open(report_path, "w") as f:
        f.write(f"# Advanced Qwen Benchmark Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\\n\\n")
        f.write("Testing with mT5 Summarization and Advanced Instructional Prompting.\\n\\n")
        f.write("| Model | Success Rate | Avg Time/Article | Failures |\\n")
        f.write("| :--- | :--- | :--- | :--- |\\n")
        for m, s in results.items():
            f.write(f"| {m} | {s['success_rate']} | {s['avg_time']} | {s['failed_count']} |\\n")
    
    logger.info(f"Benchmark complete! Report saved locally to {report_path}")

if __name__ == "__main__":
    # Test a mix of Qwen 2.5 and 3.5 (installed ones)
    qwen_models = [
        "qwen2.5:7b",
        "qwen2.5:32b",
        "qwen3.5:0.8b",
        "qwen3.5:2b",
        "llama3.1:latest" # Baseline
    ]
    advanced_benchmark_flow(models=qwen_models, article_count=2)
