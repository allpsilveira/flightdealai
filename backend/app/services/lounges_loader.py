import json
import os
from typing import List, Dict


def _default_path() -> str:
    root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    return os.path.join(root, 'data', 'lounges.json')


def load_lounges(path: str | None = None) -> List[Dict]:
    """Load and minimally validate lounges JSON.

    Expects a JSON array of objects with at least: airport_iata, lounge_name, access, hours
    """
    p = path or _default_path()
    if not os.path.exists(p):
        return []
    with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)

    validated = []
    for i, item in enumerate(data or []):
        if not isinstance(item, dict):
            continue
        iata = item.get('airport_iata')
        name = item.get('lounge_name')
        access = item.get('access')
        hours = item.get('hours')
        if not iata or not isinstance(iata, str) or len(iata) != 3:
            continue
        if not name or not isinstance(name, str):
            continue
        if not access or not isinstance(access, list):
            continue
        if not hours or not isinstance(hours, str):
            continue
        # normalize
        item['airport_iata'] = iata.upper()
        validated.append(item)

    return validated
