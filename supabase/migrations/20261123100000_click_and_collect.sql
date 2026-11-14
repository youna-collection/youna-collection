-- Le retrait devient « Click & collect », sans adresse affichée.
update public.shipping_methods
set name = 'Click & collect',
    description = 'Gratuit. Nous vous contacterons pour convenir du retrait.'
where code = 'retrait_avenue83';
