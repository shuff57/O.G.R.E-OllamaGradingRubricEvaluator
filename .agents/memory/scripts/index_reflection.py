#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnknownLambdaType=false, reportUnknownMemberType=false
"""Index a session reflection markdown file into LightRAG knowledge graph."""

import sys
import asyncio
from pathlib import Path

WORKING_DIR = Path(__file__).parent.parent / "lightrag_workdir"


async def main():
    if len(sys.argv) < 2:
        print("Usage: index_reflection.py <reflection-file.md>")
        sys.exit(1)

    reflection_path = Path(sys.argv[1])
    if not reflection_path.exists():
        print(f"Error: File {reflection_path} not found")
        sys.exit(1)

    try:
        from lightrag import LightRAG
        from lightrag.llm.ollama import ollama_model_complete, ollama_embed
        from lightrag.utils import EmbeddingFunc

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

        content = reflection_path.read_text()
        await rag.ainsert(content)
        print(f"Successfully indexed: {reflection_path.name}")

    except ImportError:
        print("LightRAG not installed. Run setup.sh first.")
        sys.exit(1)
    except Exception as e:
        print(f"Warning: LightRAG indexing failed: {e}")
        print(
            "Reflection saved to pending/ for later indexing when LightRAG is available."
        )


if __name__ == "__main__":
    asyncio.run(main())
