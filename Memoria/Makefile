.PHONY: pdf clean view

pdf:
	latexmk -pdf -shell-escape -interaction=nonstopmode main.tex

clean:
	latexmk -C
	rm -f *.bbl *.blg *.aux *.out *.toc *.lof *.lot
	rm -rf _minted-main

view: pdf
	@echo "PDF generado: $(CURDIR)/main.pdf"