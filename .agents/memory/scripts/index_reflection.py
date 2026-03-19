#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnknownLambdaType=false, reportUnknownMemberType=false
"""Index a session reflection markdown file into LightRAG knowledge graph."""

import sys
import asyncio
from pathlib import Path
from functools import partial

WORKING_DIR = Path(__file__).parent.parent / "lightrag_workdir"


def activate_venv():
    """Auto-activate the .venv if it exists and we're not already in it."""
    venv_dir = Path(__file__).parent.parent / ".venv"
    venv_python = venv_dir / "bin" / "python3"
    if venv_python.exists() and str(venv_dir) not in sys.prefix:
        import os

        os.execv(str(venv_python), [str(venv_python)] + sys.argv)


activate_venv()


async def main():
    if len(sys.argv) < 2:
        print("Usage: index_reflection.py <reflection-file.md>")
        sys.exit(1)

    reflection_path = Path(sys.argv[1])
    if not reflection_path.exists():
        print(f"Error: File {reflection_path} not found")
        sys.exit(1)

    missing = []
    try:
        from lightrag import LightRAG
        from lightrag.llm.ollama import ollama_model_complete, ollama_embed
        from lightrag.utils import EmbeddingFunc
    except ImportError:
        missing.append("lightrag-hku")

    if missing:
        print(
            f"Missing packages: {', '.join(missing)}. Run: bash .agents/memory/scripts/setup.sh"
        )
        sys.exit(1)

    try:
        from lightrag import LightRAG
        from lightrag.llm.ollama import ollama_model_complete, ollama_embed
        from lightrag.utils import EmbeddingFunc

        rag = LightRAG(
            working_dir=str(WORKING_DIR),
            llm_model_func=ollama_model_complete,
            llm_model_name="nemotron-3-super:cloud",
            llm_model_kwargs={
                "host": "http://localhost:11434",
                "options": {"num_ctx": 8192},
                "timeout": 600,
            },
            embedding_func=EmbeddingFunc(
                embedding_dim=1024,
                max_token_size=8192,
                func=partial(
                    ollama_embed.func,
                    embed_model="bge-m3:latest",
                    host="http://localhost:11434",
                ),
            ),
        )

        await rag.initialize_storages()

        content = reflection_path.read_text()
        print(
            f"Extracting entities from {reflection_path.name} (this can take 2-5 min with local Ollama models)..."
        )
        await rag.ainsert(content)
        print(f"Successfully indexed: {reflection_path.name}")

    except Exception as e:
        print(f"Warning: LightRAG indexing failed: {e}")
        print(
            "Reflection saved to pending/ for later indexing when LightRAG is available."
        )


if __name__ == "__main__":
    asyncio.run(main())
