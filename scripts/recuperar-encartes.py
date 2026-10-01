#!/usr/bin/env python3
"""
Recupera os encartes salvos (aba Encartes do Encarte Online) a partir dos
backups diários do banco (/root/smartprice-backups/*.sql.gz) — roda NA VPS
primária, como root.

  python3 recuperar-encartes.py            # só mostra o que achou (não grava nada)
  python3 recuperar-encartes.py --gravar   # junta e grava

Por lista (`settings/encarte_historico_<chave>`), junta pelo `id` os encartes
do banco atual + de todos os backups (o mais recente de cada id vence) e
grava a lista unida. Nada que está hoje no banco é perdido: antes de gravar,
o valor atual vai pra `settings/<id>__antes_recuperacao_<data>`.

Obs.: encartes apagados de propósito nos últimos 7 dias também voltam — é só
apagar de novo na aba Encartes.

Pelo `ssh` sem copiar o arquivo:
  ssh root@VPS 'python3 - --gravar' < scripts/recuperar-encartes.py
"""
import glob
import gzip
import json
import os
import subprocess
import sys
from datetime import datetime

BACKUP_DIR = '/root/smartprice-backups'
CONTAINER = 'smartprice_postgres'
DB = ['psql', '-U', 'smartprice', '-d', 'smartprice', '-v', 'ON_ERROR_STOP=1']
PREFIXO = 'encarte_historico'


def psql(sql, entrada=None):
    r = subprocess.run(['docker', 'exec', '-i', CONTAINER] + DB + ['-At', '-c', sql] if entrada is None
                       else ['docker', 'exec', '-i', CONTAINER] + DB + ['-At'],
                       input=entrada, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('ERRO no psql: ' + r.stderr.strip())
    return r.stdout


def desescapar_copy(campo):
    """Formato texto do COPY do Postgres -> string original."""
    if campo == '\\N':
        return None
    out, i, n = [], 0, len(campo)
    simples = {'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '\\': '\\'}
    while i < n:
        c = campo[i]
        if c != '\\' or i + 1 >= n:
            out.append(c); i += 1; continue
        p = campo[i + 1]
        if p in simples:
            out.append(simples[p]); i += 2
        elif p in '01234567':
            j = i + 1
            while j < n and j < i + 4 and campo[j] in '01234567':
                j += 1
            out.append(chr(int(campo[i + 1:j], 8))); i = j
        elif p == 'x':
            j = i + 2
            while j < n and j < i + 4 and campo[j] in '0123456789abcdefABCDEF':
                j += 1
            out.append(chr(int(campo[i + 2:j], 16))); i = j
        else:
            out.append(p); i += 2
    return ''.join(out)


def settings_do_backup(caminho):
    """{id: value} das linhas encarte_historico* do dump."""
    achados, colunas, dentro = {}, None, False
    with gzip.open(caminho, 'rt', encoding='utf-8', errors='replace') as f:
        for linha in f:
            if not dentro:
                if linha.startswith('COPY public.settings ') or linha.startswith('COPY settings '):
                    colunas = [c.strip().strip('"') for c in linha[linha.index('(') + 1:linha.index(')')].split(',')]
                    dentro = True
                continue
            if linha.startswith('\\.'):
                break
            partes = linha.rstrip('\n').split('\t')
            reg = dict(zip(colunas, partes))
            sid = desescapar_copy(reg.get('id', ''))
            if sid and sid.startswith(PREFIXO):
                bruto = desescapar_copy(reg.get('value', '\\N'))
                if bruto is not None:
                    try:
                        achados[sid] = json.loads(bruto)
                    except ValueError:
                        print(f'  aviso: {sid} ilegível em {os.path.basename(caminho)}')
    return achados


def listas_por_chave(valores):
    """Normaliza pra {chave_settings: [encartes]} — inclui o blob legado
    `encarte_historico` ({cnpj: [..]}) espalhado nas chaves por cnpj."""
    saida = {}
    for sid, v in valores.items():
        if sid == PREFIXO and isinstance(v, dict):
            for cnpj, lista in v.items():
                if isinstance(lista, list):
                    saida.setdefault(f'{PREFIXO}_{cnpj}', []).extend(lista)
        elif sid.startswith(PREFIXO + '_') and '__antes_recuperacao_' not in sid and isinstance(v, list):
            saida.setdefault(sid, []).extend(v)
    return saida


def main():
    gravar = '--gravar' in sys.argv

    atual_bruto = {}
    for linha in psql(f"select id, value::text from settings where id like '{PREFIXO}%'").splitlines():
        sid, _, val = linha.partition('|')
        try:
            atual_bruto[sid] = json.loads(val)
        except ValueError:
            pass
    atual = listas_por_chave(atual_bruto)

    fontes = [('BANCO ATUAL', atual)]
    for caminho in sorted(glob.glob(os.path.join(BACKUP_DIR, 'smartprice_db_*.sql.gz'))):
        fontes.append((os.path.basename(caminho), listas_por_chave(settings_do_backup(caminho))))
    if len(fontes) == 1:
        print(f'Nenhum backup encontrado em {BACKUP_DIR}.')

    print('\n=== Encartes salvos por fonte ===')
    for nome, listas in fontes:
        print(f'\n[{nome}]')
        if not listas:
            print('  (nenhuma lista)')
        for chave, lista in sorted(listas.items()):
            datas = sorted(e.get('createdAt', '') for e in lista if isinstance(e, dict))
            print(f'  {chave}: {len(lista)} encarte(s)' + (f'  ({datas[0][:10]} a {datas[-1][:10]})' if datas else ''))

    # União por id: fonte mais recente primeiro (banco atual, depois backups do mais novo pro mais velho).
    ordem = [fontes[0]] + list(reversed(fontes[1:]))
    unidas = {}
    for _, listas in ordem:
        for chave, lista in listas.items():
            alvo = unidas.setdefault(chave, {})
            for e in lista:
                if isinstance(e, dict) and e.get('id') and e['id'] not in alvo:
                    alvo[e['id']] = e

    print('\n=== Resultado da recuperação ===')
    mudancas = []
    for chave, por_id in sorted(unidas.items()):
        lista = sorted(por_id.values(), key=lambda e: e.get('createdAt', ''), reverse=True)
        hoje = len(atual.get(chave, []))
        volta = len(lista) - hoje
        print(f'  {chave}: hoje {hoje} -> recuperado {len(lista)}' + (f'  (+{volta} de volta)' if volta > 0 else ''))
        if volta > 0:
            for e in lista:
                if e['id'] not in {x.get('id') for x in atual.get(chave, [])}:
                    print(f'      + {e.get("nome", "(sem nome)")}  [{e.get("createdAt", "")[:16]}]')
            mudancas.append((chave, lista))

    if not mudancas:
        print('\nNada a recuperar: o banco atual já tem todos os encartes que aparecem nos backups.')
        return
    if not gravar:
        print('\nNADA FOI GRAVADO. Pra gravar, rode de novo com --gravar.')
        return

    carimbo = datetime.now().strftime('%Y%m%d_%H%M%S')
    for chave, lista in mudancas:
        tag = '$enc' + carimbo + '$'
        corpo = json.dumps(lista, ensure_ascii=False)
        if tag in corpo:
            sys.exit('ERRO: conteúdo contém o delimitador, abortando.')
        sql = (
            "BEGIN;\n"
            f"INSERT INTO settings (id, value, updated_at) "
            f"SELECT id || '__antes_recuperacao_{carimbo}', value, NOW() FROM settings WHERE id = '{chave}';\n"
            f"INSERT INTO settings (id, value, updated_at) VALUES ('{chave}', {tag}{corpo}{tag}::jsonb, NOW()) "
            f"ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();\n"
            "COMMIT;\n"
        )
        psql(None, entrada=sql)
        print(f'  gravado: {chave} ({len(lista)} encartes; anterior guardado em {chave}__antes_recuperacao_{carimbo})')
    print('\nPronto. Recarregue o Encarte Online (Ctrl+Shift+R) e abra a aba Encartes.')


if __name__ == '__main__':
    main()
