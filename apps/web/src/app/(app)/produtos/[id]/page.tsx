import { ArrowDownToLine, History, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductActions, VariantManager } from "@/components/product-actions";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { getMe, getProductOr404 } from "@/lib/data";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { canEditCatalog, canMoveStock } from "@/lib/permissions";

export const metadata: Metadata = { title: "Produto" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children || "—"}</dd>
    </div>
  );
}

export default async function ProductPage({ params }: PageProps<"/produtos/[id]">) {
  const { id } = await params;
  const [me, product] = await Promise.all([getMe(), getProductOr404(id)]);
  const canEdit = canEditCatalog(me.role);
  const active = product.variants.filter((v) => v.active);
  const pieces = active.reduce((sum, v) => sum + v.quantity, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Ref. ${product.reference}`}
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {!product.active && <Badge>Desativado</Badge>}
            {formatQuantity(pieces)} peça(s) em {active.length} SKU(s) ativo(s)
          </span>
        }
        action={canEdit ? <ProductActions product={product} /> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card
          title="Variações e saldos"
          description="Cada combinação de tamanho e cor tem saldo independente."
          flush
          action={
            canMoveStock(me.role) && product.active ? (
              <div className="flex gap-2">
                <Link href={`/movimentacoes/nova?tipo=ENTRY&produto=${product.id}`} className={`${buttonClass.secondary} px-3 py-1.5 text-xs`}>
                  <ArrowDownToLine size={14} /> Entrada
                </Link>
                <Link href={`/movimentacoes/nova?tipo=SALE&produto=${product.id}`} className={`${buttonClass.accent} px-3 py-1.5 text-xs`}>
                  <ShoppingBag size={14} /> Venda
                </Link>
              </div>
            ) : undefined
          }
        >
          <VariantManager product={product} canEdit={canEdit} />
        </Card>

        <div className="space-y-6">
          <Card title="Dados do modelo">
            <dl className="grid grid-cols-2 gap-4 xl:grid-cols-1">
              <Info label="Categoria">{product.category?.name}</Info>
              <Info label="Fornecedor">{product.supplier?.name}</Info>
              <Info label="Coleção">{product.collection}</Info>
              <Info label="Linha / modelagem">{product.fit}</Info>
              <Info label="Preço de venda">{formatCurrency(product.salePrice)}</Info>
              <Info label="Estoque mínimo por SKU">{product.minQuantity || "Sem alerta"}</Info>
              <Info label="Cadastrado em">{formatDate(product.createdAt)}</Info>
            </dl>
            {product.description && (
              <p className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-600">
                {product.description}
              </p>
            )}
          </Card>
          <Link href={`/movimentacoes?productId=${product.id}`} className={`${buttonClass.secondary} w-full`}>
            <History size={16} /> Histórico do produto
          </Link>
        </div>
      </div>
    </>
  );
}
