import os
import sqlite3
import re
from typing import List, Optional
from pydantic import BaseModel, Field
from prefect import flow, task, get_run_logger
import ollama
from dotenv import load_dotenv
import time

# Load .env dynamically using absolute path relative to this script
current_dir = os.getenv("DB_PATH", os.path.dirname(os.path.abspath(__file__)))
# Wait, we want to resolve relative to __file__:
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
    
    # Resolve relative db_path to absolute relative to project root
    if not os.path.isabs(db_path):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(current_dir))
        db_path = os.path.join(project_root, db_path)
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get articles that don't have questions yet, including metadata
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
def generate_questions_for_article(article: dict, model_name: str):
    logger = get_run_logger()
    client = ollama.Client(host=os.getenv("OLLAMA_URL"))
    
    content = article['content'].strip()
    content_len = len(content)
    
    # Determine number of questions dynamically based on content length
    if content_len < 1500:
        num_questions = 1
    elif content_len < 3000:
        num_questions = 2
    elif content_len < 6000:
        num_questions = 3
    else:
        num_questions = 5
        
    # Split content into paragraphs
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', content) if p.strip()]
    
    # Pass up to 15 paragraphs of context for longer text
    chunk = "\n\n".join(paragraphs[:15])
    
    metadata = f"""
    Title: {article['title']}
    Silsilah: {article['silsilah']}
    Speaker: {article['speaker']}
    """
    
    prompt = f"""
    Bismillah. You are a noble and scholarly Islamic teacher (Ustadz) who strictly adheres to the Manhaj Salaf (the methodology of the righteous predecessors) and a distinguished graduate of the Islamic University of Madinah.
    You possess deep knowledge of Islamic sciences, absolute precision in teaching, and you strictly rely on authentic, verified evidence from the provided text, free from any bias or speculation.
    Based on the following article metadata and content chunk, generate {num_questions} high-quality multiple choice questions in Indonesian language.
    
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
        logger.info(f"Generated questions for '{article['title']}' using {model_name} in {elapsed:.2f}s")
        
        # Validate with Pydantic
        content = response['message']['content'].strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        quiz_set = QuizSet.model_validate_json(content)
        return quiz_set.questions, elapsed
    except Exception as e:
        logger.error(f"Failed to generate for article {article['id']}: {str(e)}")
        return [], 0

@task
def save_questions(article_id: int, questions: List[QuizQuestion], model_name: str):
    if not questions:
        return
        
    db_path = os.getenv("DB_PATH", "backend/data.db")
    
    # Resolve relative db_path to absolute relative to project root
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
            "Server-Prod-01",
            "buatan AI"
        ))
    
    conn.commit()
    conn.close()

@flow(name="Quiz Generation Pipeline - High Quality")
def quiz_generator_flow(limit: int = 1500, model: str = "aya:latest"):
    logger = get_run_logger()
    logger.info(f"Starting high-quality quiz generation flow using model: {model}")
    
    articles = get_articles_to_process(limit)
    
    if not articles:
        logger.info("No articles found to process.")
        return
        
    total_time = 0
    generated_count = 0
    
    for article in articles:
        questions, elapsed = generate_questions_for_article(article, model)
        if questions:
            save_questions(article['id'], questions, model)
            total_time += elapsed
            generated_count += len(questions)
            
    if generated_count > 0:
        avg_time = total_time / (generated_count / 3)
        logger.info(f"Finished! Generated {generated_count} questions. Avg time per article: {avg_time:.2f}s")

if __name__ == "__main__":
    import sys
    import time
    
    target_model = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DEFAULT_MODEL", "aya:latest")
    print(f"Starting quiz generator daemon. Model: {target_model}")
    
    while True:
        try:
            quiz_generator_flow(limit=20, model=target_model)
        except Exception as e:
            print(f"Flow encountered an error: {e}")
            
        print("Batch complete. Sleeping for 60 seconds before checking for new articles...")
        time.sleep(60)
