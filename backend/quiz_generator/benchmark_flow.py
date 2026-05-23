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

# Load .env dynamically using absolute path relative to this script
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
env_path = os.path.join(project_root, ".env")
load_dotenv(dotenv_path=env_path, override=True)

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
def get_articles_for_benchmark(limit: int = 3) -> List[dict]:
    logger = get_run_logger()
    db_path = os.getenv("DB_PATH", "backend/data.db")
    
    # Resolve relative db_path to absolute relative to project root
    if not os.path.isabs(db_path):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(current_dir))
        db_path = os.path.join(project_root, db_path)
        
    logger.info(f"DIAGNOSTIC - Resolved DB_PATH: '{db_path}'")
    logger.info(f"DIAGNOSTIC - CWD: '{os.getcwd()}'")
    logger.info(f"DIAGNOSTIC - DB File exists: {os.path.exists(db_path)}")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    
    # Get a fixed set of articles for fair benchmarking, including metadata, skipping already processed ones
    cursor.execute("""
        SELECT a.id, a.title, a.silsilah, a.speaker, a.content 
        FROM articles a
        LEFT JOIN questions q ON a.id = q.article_id
        WHERE q.id IS NULL AND a.content != ''
        LIMIT ?
    """, (limit,))
    
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return articles

@task
def generate_questions_task(article: dict, model_name: str) -> Tuple[bool, float, str, List[QuizQuestion]]:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    
    # Split content into paragraphs
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', article['content']) if p.strip()]
    
    # Take a rolling chunk of the first 6 paragraphs (same as generator)
    chunk_size = 6
    chunk = "\n\n".join(paragraphs[:chunk_size])
    
    metadata = f"""
    Title: {article['title']}
    Silsilah: {article.get('silsilah', '')}
    Speaker: {article.get('speaker', '')}
    """
    
    prompt = f"""
    Bismillah. You are a noble and scholarly Islamic teacher (Ustadz) who strictly adheres to the Manhaj Salaf (the methodology of the righteous predecessors) and a distinguished graduate of the Islamic University of Madinah.
    You possess deep knowledge of Islamic sciences, absolute precision in teaching, and you strictly rely on authentic, verified evidence from the provided text, free from any bias or speculation.
    Based on the following article metadata and content chunk, generate 3 high-quality multiple choice questions in Indonesian language.
    
    Metadata:
    {metadata}
    
    Content Chunk:
    {chunk}
    
    INSTRUCTIONS:
    1. The questions must be challenging and based on the specific details in the content chunk.
    2. Provide 4 options (A, B, C, D).
    3. 'correct_option' must be the letter (A, B, C, or D).
    4. 'explanation' should explain the reasoning clearly.
    5. 'reference_snippet' MUST BE the EXACT verbatim sentence or part from the provided Content Chunk that verifies the correct answer.
    
    Return the result in JSON format matching this schema:
    {{
        "questions": [
            {{
                "question_text": "text",
                "option_a": "text",
                "option_b": "text",
                "option_c": "text",
                "option_d": "text",
                "correct_option": "A/B/C/D",
                "explanation": "text",
                "reference_snippet": "exact text from content"
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
        content = response['message']['content']
        
        # Validate with Pydantic
        quiz_set = QuizSet.model_validate_json(content)
        return True, elapsed, "", quiz_set.questions
    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        logger.error(f"Model {model_name} failed: {error_msg}")
        return False, elapsed, error_msg, []

@task
def save_benchmark_questions(article_id: int, questions: List[QuizQuestion], model_name: str):
    if not questions:
        return
        
    db_path = os.getenv("DB_PATH", "backend/data.db")
    if not os.path.isabs(db_path):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(current_dir))
        db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    for q in questions:
        cursor.execute("""
            INSERT INTO questions (
                article_id, 
                question_text, 
                option_a, 
                option_b, 
                option_c, 
                option_d, 
                correct_option, 
                explanation, 
                reference_snippet, 
                created_by_model, 
                created_on_device, 
                checked_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            article_id, 
            q.question_text, 
            q.option_a, 
            q.option_b, 
            q.option_c, 
            q.option_d, 
            q.correct_option.upper(), 
            q.explanation, 
            q.reference_snippet, 
            model_name, 
            "Server-Dev-01", 
            "buatan AI"
        ))
    
    conn.commit()
    conn.close()

@flow(name="LLM Model Benchmark")
def run_benchmark_flow(models: List[str], article_limit: int = 2):
    logger = get_run_logger()
    logger.info(f"Starting high-quality benchmark for models: {models}")
    
    articles = get_articles_for_benchmark(article_limit)
    results = {}

    for model in models:
        logger.info(f"Testing model: {model}")
        model_stats = {"success": 0, "total_time": 0, "errors": []}
        
        for article in articles:
            success, elapsed, error, questions = generate_questions_task(article, model)
            model_stats["total_time"] += elapsed
            if success:
                model_stats["success"] += 1
                save_benchmark_questions(article['id'], questions, model)
            else:
                model_stats["errors"].append(error)
        
        results[model] = {
            "success_rate": f"{(model_stats['success'] / len(articles)) * 100:.0f}%",
            "avg_time": f"{model_stats['total_time'] / len(articles):.2f}s",
            "failed_count": len(model_stats["errors"])
        }

    # Generate Report
    report_path = "benchmark_report.md"
    with open(report_path, "w") as f:
        f.write(f"# LLM Benchmark Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("| Model | Success Rate | Avg Time/Article | Failures |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        for m, s in results.items():
            f.write(f"| {m} | {s['success_rate']} | {s['avg_time']} | {s['failed_count']} |\n")
    
    logger.info(f"Benchmark complete! Report saved to {report_path}")

if __name__ == "__main__":
    benchmark_models = ["qwen2.5:7b", "gemma2:9b", "mistral-nemo:latest", "phi3.5:latest", "aya:latest"]
    run_benchmark_flow(models=benchmark_models, article_limit=4)


