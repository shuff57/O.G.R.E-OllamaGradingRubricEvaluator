#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnknownLambdaType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false
"""Query the LightRAG knowledge graph for relevant past session learnings."""

import sys
import asyncio
from pathlib import Path

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
        print("Usage: query_memory.py '<your query>'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])

    missing = []
    try:
        import numpy as np
    except ImportError:
        missing.append("numpy")
    try:
        import ollama
    except ImportError:
        missing.append("ollama")
    try:
        from lightrag import LightRAG, QueryParam
        from lightrag.llm.ollama import ollama_model_complete
        from lightrag.utils import EmbeddingFunc
    except ImportError:
        missing.append("lightrag-hku")

    if missing:
        print(
            f"Missing packages: {', '.join(missing)}. Run: bash .agents/memory/scripts/setup.sh"
        )
        sys.exit(1)

    try:
        import numpy as np
        import ollama
        from lightrag import LightRAG, QueryParam
        from lightrag.llm.ollama import ollama_model_complete
        from lightrag.utils import EmbeddingFunc

        if not WORKING_DIR.exists() or not any(WORKING_DIR.iterdir()):
            print(
                "No indexed memories yet. Index some reflections first with index_reflection.py."
            )
            return

        async def nomic_embed(texts: list[str]) -> np.ndarray:
            client = ollama.AsyncClient()
            data = await client.embed(model="nomic-embed-text", input=texts)
            await client._client.aclose()
            return np.array(data["embeddings"])

        rag = LightRAG(
            working_dir=str(WORKING_DIR),
            llm_model_func=ollama_model_complete,
            llm_model_name="llama3.2",
            embedding_func=EmbeddingFunc(
                embedding_dim=768,
                max_token_size=8192,
                func=nomic_embed,
            ),
        )

        await rag.initialize_storages()
        result = await rag.aquery(query, param=QueryParam(mode="mix"))
        print("=== Relevant Past Learnings ===")
        print(result)

    except Exception as e:
        print(f"Note: Knowledge graph query unavailable: {e}")
        print("Check pending/ for recent unindexed reflections.")


if __name__ == "__main__":
    asyncio.run(main())
