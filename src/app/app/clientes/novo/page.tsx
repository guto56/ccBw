import { FormCliente } from "@/components/app/form-cliente";

export const metadata = { title: "Novo cliente" };

export default function NovoCliente() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-titulo-2 font-bold">Novo cliente</h1>
      <p className="medida mt-1 text-grafite-2">Cadastre a empresa do Simples Nacional ou MEI. Depois você envia as notas ou a planilha de produtos dela.</p>
      <div className="mt-6">
        <FormCliente />
      </div>
    </div>
  );
}
