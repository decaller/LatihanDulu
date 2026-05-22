import os
import sqlite3
import json
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from prefect import flow, task, get_run_logger
import ollama
from dotenv import load_dotenv
import time
from datetime import datetime

load_dotenv()

# Pydantic model for structured output
class QuizQuestion(BaseModel):
    question_text: str = Field(..., description="The multiple choice question text based on the article")
    option_a: str = Field(..., description="Option A")
    option_b: str = Field(..., description="Option B")
    option_c: str = Field(..., description="Option C")
    option_d: str = Field(..., description="Option D")
    correct_option: str = Field(..., description="The correct option letter (A, B, C, or D)")
    explanation: str = Field(..., description="Brief explanation why the option is correct")

class QuizSet(BaseModel):
    questions: List[QuizQuestion]

@task
def get_articles_for_benchmark(limit: int = 3) -> List[dict]:
    db_path = os.getenv("DB_PATH", "data.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get a fixed set of articles for fair benchmarking
    cursor.execute("""
        SELECT id, title, content 
        FROM articles 
        WHERE content != ''
        LIMIT ?
    """, (limit,))
    
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return articles

@task
def generate_questions_task(article: dict, model_name: str) -> Tuple[bool, float, str]:
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    
    prompt = f"""
    Based on the following article content, generate 3 multiple choice questions in Indonesian language.
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
                "explanation": "text"
            }}
        ]
    }}
    
    Article Title: {article['title']}
    Article Content: {article['content'][:2000]}
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
        QuizSet.model_validate_json(content)
        return True, elapsed, ""
    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        logger.error(f"Model {model_name} failed: {error_msg}")
        return False, elapsed, error_msg

@flow(name="LLM Model Benchmark")
def run_benchmark_flow(models: List[str], article_limit: int = 2):
    logger = get_run_logger()
    logger.info(f"Starting benchmark for models: {models}")
    
    articles = get_articles_for_benchmark(article_limit)
    results = {}

    for model in models:
        logger.info(f"Testing model: {model}")
        model_stats = {"success": 0, "total_time": 0, "errors": []}
        
        for article in articles:
            success, elapsed, error = generate_questions_task(article, model)
            model_stats["total_time"] += elapsed
            if success:
                model_stats["success"] += 1
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
    benchmark_models = ["qwen2.5:14b", "gemma2:9b", "mistral-nemo:latest", "phi3.5:latest", "aya:latest"]
    run_benchmark_flow(models=benchmark_models, article_limit=2)
