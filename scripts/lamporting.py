

cmv1_file = open('./lamports.txt', 'rb')
cmv1 = cmv1_file.readlines()
    
print('unrefunded cmv1 cms:')
print(f"found {len(cmv1)} cms")

cmv1lamports = 0
for line in cmv1:
    cmv1lamports += int(line.strip()) / 1e9
    
print ('sols left unrefunded in cmv1 (still even tho shit cannot be started no longer all y\'all): ')
print(cmv1lamports)

cmv2_file = open('./lamports2.txt', 'rb')
cmv2 = cmv2_file.readlines()
  
print('unrefunded v2 cms:')
print(f"found {len(cmv2)} cms")

cmv2lamports = 0
for line in cmv2:
    cmv2lamports += int(line.strip())  / 1e9
    
print ('sols left unrefunded in cmv2: ')
print(cmv2lamports)

print('sol be $41.79 (eh, snapshot, suck it)')

print('total sols: ')
sols = cmv2lamports + cmv2lamports
print(sols)

print('what be that in dollhairs tho stacc? the ppl think in fiat')
print(sols * 41.79)