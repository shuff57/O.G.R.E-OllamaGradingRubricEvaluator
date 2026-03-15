#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnknownLambdaType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false
"""Query the LightRAG knowledge graph for relevant past session learnings."""

import sys
import asyncio
from pathlib import Path

WORKING_DIR = Path(__file__).parent.parent / "lightrag_workdir"


async def main():
    if len(sys.argv) < 2:
        print("Usage: query_memory.py '<your query>'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])

    try:
        from lightrag import LightRAG, QueryParam
        from lightrag.llm.ollama import ollama_model_complete, ollama_embed
        from lightrag.utils import EmbeddingFunc

        if not WORKING_DIR.exists() or not any(WORKING_DIR.iterdir()):
            print(
                "No indexed memories yet. Index some reflections first with index_reflection.py."
            )
            return

        rag = LightRAG(
            working_dir=str(WORKING_DIR),
            llm_model_func=ollama_model_complete,
            llm_model_name="llama3.2",
            embedding_func=EmbeddingFunc(
                embedding_dim=768,
                max_token_size=8192,
                func=lambda texts: ollama_embed(texts, embed_model="nomic-embed-text"),
            ),
        )

        result = await rag.aquery(query, param=QueryParam(mode="mix"))
        print("=== Relevant Past Learnings ===")
        print(result)

    except ImportError:
        print("LightRAG not installed. Run setup.sh first.")
    except Exception as e:
        print(f"Note: Knowledge graph query unavailable: {e}")
        print("Check pending/ for recent unindexed reflections.")


if __name__ == "__main__":
    asyncio.run(main())
