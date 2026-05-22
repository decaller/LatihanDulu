import os
import sqlite3
from typing import List, Optional
from pydantic import BaseModel, Field
from prefect import flow, task, get_run_logger
import ollama
from dotenv import load_dotenv
import time

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
def get_articles_to_process(limit: int = 5) -> List[dict]:
    db_path = os.getenv("DB_PATH", "data.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get articles that don't have questions yet
    cursor.execute("""
        SELECT a.id, a.title, a.content 
        FROM articles a 
        LEFT JOIN questions q ON a.id = q.article_id 
        WHERE q.id IS NULL AND a.content != ''
        LIMIT ?
    """, (limit,))
    
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return articles

@task
def generate_questions_for_article(article: dict, model_name: str):
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
    Article Content: {article['content'][:2000]} # Limiting content for context window
    """
    
    start_time = time.time()
    try:
        response = client.chat(
            model=model_name,
            messages=[{'role': 'user', 'content': prompt}],
            format='json'
        )
        elapsed = time.time() - start_time
        logger.info(f"Generated questions for '{article['title']}' using {model_name} in {elapsed:.2f}s")
        
        # Validate with Pydantic
        quiz_set = QuizSet.model_validate_json(response['message']['content'])
        return quiz_set.questions, elapsed
    except Exception as e:
        logger.error(f"Failed to generate for article {article['id']}: {str(e)}")
        return [], 0

@task
def save_questions(article_id: int, questions: List[QuizQuestion]):
    if not questions:
        return
        
    db_path = os.getenv("DB_PATH", "data.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    for q in questions:
        cursor.execute("""
            INSERT INTO questions (article_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (article_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.upper(), q.explanation))
    
    conn.commit()
    conn.close()

@flow(name="Quiz Generation Pipeline")
def quiz_generator_flow(limit: int = 5, model: str = "llama3.1:latest"):
    logger = get_run_logger()
    logger.info(f"Starting quiz generation flow using model: {model}")
    
    articles = get_articles_to_process(limit)
    
    if not articles:
        logger.info("No articles found to process.")
        return
        
    total_time = 0
    generated_count = 0
    
    for article in articles:
        questions, elapsed = generate_questions_for_article(article, model)
        if questions:
            save_questions(article['id'], questions)
            total_time += elapsed
            generated_count += len(questions)
            
    if generated_count > 0:
        avg_time = total_time / (generated_count / 3) # 3 questions per article
        logger.info(f"Finished! Generated {generated_count} questions. Avg time per article: {avg_time:.2f}s")

if __name__ == "__main__":
    import sys
    # Allow passing model name as argument
    target_model = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DEFAULT_MODEL")
    quiz_generator_flow(limit=3, model=target_model)
