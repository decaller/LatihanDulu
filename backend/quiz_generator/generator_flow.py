import os
import sqlite3
import re
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
    reference_snippet: str = Field(..., description="The exact verbatim text from the article content that supports the answer")

class QuizSet(BaseModel):
    questions: List[QuizQuestion]

@task
def get_articles_to_process(limit: int = 5) -> List[dict]:
    db_path = os.getenv("DB_PATH", "data.db")
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
    
    # Split content into paragraphs
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', article['content']) if p.strip()]
    
    # Take a rolling chunk of at least 4 paragraphs
    # For now, we take the first 4-6 paragraphs as a significant chunk
    chunk_size = 6
    chunk = "\n\n".join(paragraphs[:chunk_size])
    
    metadata = f"""
    Title: {article['title']}
    Silsilah: {article['silsilah']}
    Speaker: {article['speaker']}
    """
    
    prompt = f"""
    Bismillah. You are an expert Islamic educator. 
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
        logger.info(f"Generated questions for '{article['title']}' using {model_name} in {elapsed:.2f}s")
        
        # Validate with Pydantic
        content = response['message']['content']
        quiz_set = QuizSet.model_validate_json(content)
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
            INSERT INTO questions (article_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, reference_snippet)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (article_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.upper(), q.explanation, q.reference_snippet))
    
    conn.commit()
    conn.close()

@flow(name="Quiz Generation Pipeline - High Quality")
def quiz_generator_flow(limit: int = 5, model: str = "aya:latest"):
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
            save_questions(article['id'], questions)
            total_time += elapsed
            generated_count += len(questions)
            
    if generated_count > 0:
        avg_time = total_time / (generated_count / 3)
        logger.info(f"Finished! Generated {generated_count} questions. Avg time per article: {avg_time:.2f}s")

if __name__ == "__main__":
    import sys
    target_model = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DEFAULT_MODEL", "aya:latest")
    quiz_generator_flow(limit=3, model=target_model)
