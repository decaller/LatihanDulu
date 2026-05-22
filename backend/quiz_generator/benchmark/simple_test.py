import os
import sqlite3
import ollama
import time
from pydantic import BaseModel, Field
from typing import List

class QuizQuestion(BaseModel):
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    explanation: str

class QuizSet(BaseModel):
    questions: List[QuizQuestion]

def test_model(model_name, article, url):
    client = ollama.Client(host=url)
    prompt = f"Generate 3 multiple choice questions in Indonesian about: {article['title']}\nContent: {article['content'][:1000]}\nReturn JSON matching schema."
    start = time.time()
    try:
        resp = client.chat(model=model_name, messages=[{'role': 'user', 'content': prompt}], format='json')
        QuizSet.model_validate_json(resp['message']['content'])
        return True, time.time() - start
    except:
        return False, time.time() - start

if __name__ == "__main__":
    url = "http://100.121.116.17:11434"
    models = ["qwen2.5:14b", "gemma2:9b", "mistral-nemo:latest", "phi3.5:latest", "aya:latest"]
    article = {"title": "Tauhid", "content": "Tauhid adalah mengesakan Allah..."}
    print("| Model | Success | Time |")
    print("|---|---|---|")
    for m in models:
        ok, dur = test_model(m, article, url)
        print(f"| {m} | {'✅' if ok else '❌'} | {dur:.2f}s |")
