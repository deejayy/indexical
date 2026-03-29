
SQLite3 version 3.49.1

https://github.com/sqlite/sqlite/releases/tag/version-3.49.1

* https://sqlite.org/howtocompile.html
* Build extension https://sqlite.org/loadext.html#build
* Full Text Search https://sqlite.org/fts5.html

### Windows

```powershell
# with "Native Tools Command Prompt"
> nmake /f makefile.msc sqlite3.c
> cl fts5.c /link -dll /out:fts5.dll
> cl /I . ext\misc\spellfix.c /link -dll /out:spellfix1.dll
# 32-bit (via native tool x86)
> cl fts5.c /link -dll /out:fts5-i386.dll
> cl /I . ext\misc\spellfix.c /link -dll /out:spellfix1-i386.dll
```


### Mac

```bash
> ./configure && make sqlite3.c
> gcc -g -fPIC -dynamiclib fts5.c -o fts5.dylib
> gcc -I. -g -fPIC -dynamiclib ext/misc/spellfix.c -o spellfix1.dylib
```


### Unix-like

```bash
> ./configure && make sqlite3.c
# 64-bit
> gcc -g -fPIC -shared fts5.c -o fts5.so
> gcc -g -fPIC -shared ./ext/misc/spellfix.c -o spellfix1.so
# 32-bit
> sudo apt install gcc-multilib
> gcc -g -fPIC -shared fts5.c -m32 -o fts5-i386.so
> gcc -g -fPIC -shared ./ext/misc/spellfix.c -m32 -o spellfix1-i386.so
```

#### check dependencies

```bash
# Windows
> dumpbin /dependents fts5.dll
# Mac
> otool -L fts5.dylib
# Unix-like
> ldd fts5.so
```
